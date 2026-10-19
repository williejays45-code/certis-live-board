import {createHash} from 'node:crypto';
import {createSourceTransport,sourceRequest} from './financial-source-transport.mjs';

const hash=v=>createHash('sha256').update(v).digest('hex');
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&
  Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const fail=()=>{throw Error('SOURCE_PAYLOAD');};
const array=v=>Array.isArray(v)&&v.length>0&&v.length<=1000;
const scale=(v,places)=>{
  if(typeof v!=='string'||!new RegExp('^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,'+places+'})?$').test(v))fail();
  const [a,b='']=v.split('.');return (BigInt(a)*10n**BigInt(places)+BigInt(b.padEnd(places,'0'))).toString();
};

// Normalized observations are a separate v1 contract: index units and monthly
// periods are NOT coerced into integer_count or a fictitious observation day.
export function parseFinancialSource(source,subject,bytes,retrievedAt) {
  const url=sourceRequest(source,subject).href;
  if(!stamp(retrievedAt)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>2*1024*1024)fail();
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail();}
  const today=retrievedAt.slice(0,10),digest=hash(bytes),observations=[],missing=[];
  const add=(period,metric,value,unit,extra={})=>{
    if(!day(period.end)||period.end>today)fail();
    observations.push({id:'financial.'+hash(JSON.stringify([source,subject,metric,period,value,unit,digest])).slice(0,32),
      subject,metric,value,unit,period,...extra});
  };
  if(source==='treasury') {
    if(!array(body?.data))fail();
    for(const row of body.data){
      if(row?.security_desc!=='Treasury Notes'||!day(row.record_date)||
        new Date(Date.parse(row.record_date)+86400000).getUTCDate()!==1)fail();
      add({kind:'month_end',end:row.record_date},'average_interest_rate',scale(row.avg_interest_rate_amt,3),'percent_milli');
    }
  } else if(source==='bls') {
    // Both documented Results containers occur across BLS API examples.
    const results=Array.isArray(body?.Results)?(body.Results.length===1?body.Results[0]:null):body?.Results;
    if(body?.status!=='REQUEST_SUCCEEDED'||!Array.isArray(body.message)||body.message.length||
      !Array.isArray(results?.series)||results.series.length!==1||
      results.series[0]?.seriesID!=='CUUR0000SA0'||!array(results.series[0].data))fail();
    for(const row of results.series[0].data){
      if(!/^\d{4}$/.test(row?.year)||!/^M(0[1-9]|1[0-2])$/.test(row.period)||!Array.isArray(row.footnotes))fail();
      // M13 annual averages are deliberately rejected rather than called months.
      const month=row.year+'-'+row.period.slice(1),end=new Date(Date.UTC(Number(row.year),Number(row.period.slice(1)),0)).toISOString().slice(0,10);
      if(!end.startsWith(month))fail();
      const preliminary=row.footnotes.some(x=>x?.code==='P');
      if(row.footnotes.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
        Object.keys(x).some(k=>!['code','text'].includes(k))||
        (x.code!==undefined&&typeof x.code!=='string')||(x.text!==undefined&&typeof x.text!=='string')))fail();
      if(end>today)fail();
      if(row.value==='-'){
        missing.push({metric:'cpi_u_all_items_nsa',period:{kind:'month',start:month+'-01',end},reason:'PUBLISHER_MISSING_VALUE'});
        continue;
      }
      add({kind:'month',start:month+'-01',end},'cpi_u_all_items_nsa',scale(row.value,3),'index_milli_1982_84_100',
        {preliminary,has_publisher_footnote:row.footnotes.some(x=>x.code||x.text)});
    }
  } else if(source==='sec') {
    if(!Number.isSafeInteger(Number(body?.cik))||String(Number(body.cik)).padStart(10,'0')!==subject.slice(4))fail();
    const rows=body?.filings?.recent;
    if(!array(rows?.accessionNumber)||!Array.isArray(rows.filingDate)||!Array.isArray(rows.form)||
      rows.accessionNumber.length!==rows.filingDate.length||rows.form.length!==rows.filingDate.length)fail();
    rows.accessionNumber.forEach((accession,i)=>{
      if(typeof accession!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(accession)||
        typeof rows.form[i]!=='string'||!/^[A-Za-z0-9 /-]{1,30}$/.test(rows.form[i]))fail();
      add({kind:'filing_day',end:rows.filingDate[i]},'filing_present','1','filing_count',
        {accession,form:rows.form[i],amendment:rows.form[i].endsWith('/A')});
    });
  }
  const identity=[...observations,...missing].map(x=>JSON.stringify([x.metric,x.period,x.accession??null]));
  if(new Set(identity).size!==identity.length)fail();
  return {schema:'certis-financial-source/1',source,subject,source_url:url,
    publisher_group:source==='sec'?'sec_issuer_submissions':source==='bls'?'us_bls':'us_treasury',
    retrieved_at:retrievedAt,validated_at:retrievedAt,raw_sha256:digest,observations,missing_observations:missing,
    source_coverage:missing.length?'partial':'requested_response_only',
    publication_at:null,independent_corroboration:'not_established',historical_accuracy:'not_qualified',
    license_review:'pending',revision_policy:'refetch_overlap_and_compare_raw_and_observation_hashes',
    assessment_state:'not_supported',evidence_strength:null,financial_action_authority:'none'};
}

// No persistence or fallback to old values. Failed retrieval cannot refresh
// last-success time. Caller must preserve prior receipts separately.
export async function acquireFinancialSource(source,subject,{read=createSourceTransport(),clock=()=>new Date().toISOString(),userAgent}={}) {
  sourceRequest(source,subject); // Invalid caller scope throws before I/O.
  const attemptAt=clock();if(!stamp(attemptAt))throw Error('SOURCE_CLOCK');
  try {
    const bytes=await read(source,subject,{userAgent});
    const finishedAt=clock();if(!stamp(finishedAt)||finishedAt<attemptAt)throw Error('SOURCE_CLOCK');
    return {status:'candidate',attempted_at:attemptAt,candidate:parseFinancialSource(source,subject,bytes,finishedAt)};
  }catch(error){
    const allowed=['SOURCE_PAYLOAD','SOURCE_HTTP','SOURCE_MEDIA','SOURCE_TOO_LARGE','SOURCE_TRUNCATED','SOURCE_TIMEOUT','SOURCE_CONTACT_REQUIRED','SOURCE_AGENT','SOURCE_CLOCK'];
    return {status:'unavailable',attempted_at:attemptAt,last_success_at:null,candidate:null,
      reason:allowed.includes(error?.message)?error.message:'SOURCE_TRANSPORT',financial_action_authority:'none'};
  }
}

// Reparse retained bytes for both versions so caller-edited metadata cannot
// substitute for a hash. Only the common requested window is compared; absent
// rows mean not observed, never a proved deletion or a zero.
export function compareSourceRevisions(source,subject,previous,current,{start,end}) {
  if(!day(start)||!day(end)||start>end)throw Error('REVISION_WINDOW');
  const a=parseFinancialSource(source,subject,previous.bytes,previous.retrievedAt);
  const b=parseFinancialSource(source,subject,current.bytes,current.retrievedAt);
  if(a.retrieved_at>b.retrieved_at)throw Error('REVISION_ORDER');
  const within=o=>o.period.end>=start&&o.period.end<=end;
  const key=o=>JSON.stringify([o.metric,o.period,o.accession??null]);
  const value=o=>JSON.stringify([o.value??null,o.unit??null,o.reason??null,o.form??null,o.amendment??null,o.preliminary??null,o.has_publisher_footnote??null]);
  const left=new Map([...a.observations,...a.missing_observations].filter(within).map(o=>[key(o),value(o)]));
  const right=new Map([...b.observations,...b.missing_observations].filter(within).map(o=>[key(o),value(o)]));
  if(!left.size||!right.size)throw Error('REVISION_COVERAGE');
  const changes=[...new Set([...left.keys(),...right.keys()])].sort().flatMap(k=>
    left.get(k)===right.get(k)?[]:[{observation_key:k,state:!left.has(k)?'newly_observed':!right.has(k)?'not_observed_in_current':'changed'}]);
  return {schema:'certis-source-revision/1',window:{start,end},
    previous_sha256:a.raw_sha256,current_sha256:b.raw_sha256,
    raw_bytes_changed:a.raw_sha256!==b.raw_sha256,changes,
    qualification:'pending_independent_review',evidence_strength:null,financial_action_authority:'none'};
}
