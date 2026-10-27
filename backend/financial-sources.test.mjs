import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {parseFinancialSource,acquireFinancialSource,compareSourceRevisions} from './financial-sources.mjs';
import {createSourceTransport,publicIPv4,sourceRequest} from './financial-source-transport.mjs';
const at='2026-10-19T12:00:00.000Z',buf=v=>Buffer.from(JSON.stringify(v));
const treasury=()=>({data:[{record_date:'2026-09-30',security_desc:'Treasury Notes',avg_interest_rate_amt:'4.125'}]});
const bls=()=>({status:'REQUEST_SUCCEEDED',message:[],Results:{series:[{seriesID:'CUUR0000SA0',data:[{year:'2026',period:'M09',value:'325.125',footnotes:[{}]}]}]}});
const sec=()=>({cik:'1234',filings:{recent:{accessionNumber:['0000001234-26-000001'],filingDate:['2026-09-30'],form:['10-K/A']}}});
test('source identity, raw digest and units remain distinct from truth, scores and par yields',()=>{
 const bytes=buf(treasury()),r=parseFinancialSource('treasury','treasury.notes',bytes,at);
 assert.equal(r.raw_sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(r.observations[0].value,'4125');assert.equal(r.observations[0].unit,'percent_milli');
 assert.equal(r.observations[0].metric,'average_interest_rate');assert.equal(r.publication_at,null);
 assert.equal(r.historical_accuracy,'not_qualified');assert.equal(r.license_review,'pending');
 assert.equal(r.evidence_strength,null);assert.equal(r.financial_action_authority,'none');
});
test('BLS preserves index scale, monthly coverage, preliminary flags and both Results shapes',()=>{
 for(const wrap of [false,true]){
  const input=bls();if(wrap)input.Results=[input.Results];
  const rows=wrap?input.Results[0].series:input.Results.series;rows[0].data[0].footnotes=[{code:'P',text:'Preliminary.'}];
  const r=parseFinancialSource('bls','cpi.us.all_items.nsa',buf(input),at).observations[0];
  assert.equal(r.value,'325125');assert.equal(r.preliminary,true);
  assert.deepEqual(r.period,{kind:'month',start:'2026-09-01',end:'2026-09-30'});
 }
});
test('publisher missing marker is an explicit gap and never a zero or a refreshed fact',()=>{
 const input=bls();input.Results.series[0].data.push({year:'2025',period:'M10',value:'-',footnotes:[{}]});
 const r=parseFinancialSource('bls','cpi.us.all_items.nsa',buf(input),at);
 assert.equal(r.observations.length,1);assert.equal(r.missing_observations.length,1);
 assert.equal(r.missing_observations[0].reason,'PUBLISHER_MISSING_VALUE');assert.equal(r.source_coverage,'partial');
 input.Results.series[0].data.push({...input.Results.series[0].data[1],value:'100.000'});
 assert.throws(()=>parseFinancialSource('bls','cpi.us.all_items.nsa',buf(input),at),/SOURCE_PAYLOAD/);
});
test('HTTP-success/body-denial, mixed subjects, future periods, annual averages and duplicates fail closed',()=>{
 const bad=[];
 let x=bls();x.status='REQUEST_NOT_PROCESSED';bad.push(x);
 x=bls();x.Results.series[0].seriesID='OTHER';bad.push(x);
 x=bls();x.message=['partial coverage'];bad.push(x);
 x=bls();x.Results.series[0].data[0].period='M13';bad.push(x);
 x=bls();x.Results.series[0].data[0].year='2027';bad.push(x);
 x=bls();x.Results.series[0].data.push(x.Results.series[0].data[0]);bad.push(x);
 x=bls();x.Results.series[0].data[0].value='NaN';bad.push(x);
 for(const input of bad)assert.throws(()=>parseFinancialSource('bls','cpi.us.all_items.nsa',buf(input),at),/SOURCE_PAYLOAD/);
 for(const value of ['2026-02-30T12:00:00.000Z','2026-10-19',123])assert.throws(()=>parseFinancialSource('treasury','treasury.notes',buf(treasury()),value),/SOURCE_PAYLOAD/);
 assert.throws(()=>parseFinancialSource('treasury','treasury.notes',Buffer.from([255]),at),/SOURCE_PAYLOAD/);
});
test('SEC retains accession/amendment and rejects cross-issuer and misaligned column arrays',()=>{
 const r=parseFinancialSource('sec','cik.0000001234',buf(sec()),at);
 assert.equal(r.observations[0].amendment,true);assert.equal(r.observations[0].accession,'0000001234-26-000001');
 assert.throws(()=>parseFinancialSource('sec','cik.0000001235',buf(sec()),at),/SOURCE_PAYLOAD/);
 const wrong=sec();wrong.filings.recent.form=[];
 assert.throws(()=>parseFinancialSource('sec','cik.0000001234',buf(wrong),at),/SOURCE_PAYLOAD/);
});
test('no arbitrary source URL, private record input or caller-selected series reaches transport',()=>{
 for(const [source,subject] of [['market','https://localhost/'],['bls','OTHER'],['sec','cik.1234'],['treasury','other']])
  assert.throws(()=>sourceRequest(source,subject),/SOURCE_TARGET/);
 for(const address of ['127.0.0.1','10.1.1.1','172.16.0.1','169.254.169.254','192.168.0.1','100.64.0.1','198.18.0.1','203.0.113.1','224.0.0.1','::1','::ffff:127.0.0.1'])assert.equal(publicIPv4(address),false,address);
 assert.equal(publicIPv4('8.8.8.8'),true);
});
function mockTransport({addresses=[{address:'8.8.8.8',family:4}],status=200,media='application/json',encoding,complete=true,chunks=[buf(treasury())]}={}){
 let calls=0,lookups=0,options;
 const read=createSourceTransport({resolve:async()=>{lookups++;return addresses;},open:(url,opts,callback)=>{
  calls++;options=opts;const req=new EventEmitter();req.destroy=()=>{};
  req.end=()=>opts.lookup(url.hostname,{},(error,ip)=>{
   if(error)return req.emit('error',error);
   assert.equal(ip,'8.8.8.8');
   const res=new EventEmitter();res.statusCode=status;res.complete=complete;
   res.headers={'content-type':media,'content-encoding':encoding};res.destroy=()=>{};
   callback(res);for(const chunk of chunks)res.emit('data',chunk);res.emit('end');
  });return req;
 }});
 return {read,get calls(){return calls;},get lookups(){return lookups;},get options(){return options;}};
}
test('connection lookup pins checked address and preserves TLS identity without inherited proxies',async()=>{
 const s=mockTransport();await s.read('treasury','treasury.notes');
 assert.equal(s.lookups,1);assert.equal(s.options.servername,'api.fiscaldata.treasury.gov');
 assert.equal(s.options.rejectUnauthorized,true);assert.equal(s.options.agent,false);
 assert.deepEqual(Object.keys(s.options.headers).sort(),['Accept','Accept-Encoding','User-Agent']);
});
test('mixed DNS/private records, redirects, encoding, oversized and incomplete responses never admit bytes',async()=>{
 for(const config of [{addresses:[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]},
  {status:302},{status:429},{media:'text/html'},{encoding:'gzip'},{complete:false},{chunks:[Buffer.alloc(2*1024*1024+1)]}]){
  const s=mockTransport(config);await assert.rejects(s.read('treasury','treasury.notes'),/SOURCE_/);assert.equal(s.calls,1);
 }
});
test('SEC contact missing does not make a network request; failures expose only stable diagnostics',async()=>{
 const s=mockTransport();await assert.rejects(s.read('sec','cik.0000001234'),/SOURCE_CONTACT_REQUIRED/);assert.equal(s.calls,0);
 const r=await acquireFinancialSource('bls','cpi.us.all_items.nsa',{clock:()=>at,read:async()=>{throw Error('raw private upstream response');}});
 assert.equal(r.reason,'SOURCE_TRANSPORT');assert.equal(r.candidate,null);assert.equal(r.last_success_at,null);
 assert.ok(!JSON.stringify(r).includes('private'));
 const good=await acquireFinancialSource('treasury','treasury.notes',{clock:()=>at,read:async()=>buf(treasury())});
 assert.equal(good.status,'candidate');
});
test('overlap review separates changed transport bytes from changed observations and missing coverage',()=>{
 const previous={bytes:buf(treasury()),retrievedAt:at},current={bytes:buf({...treasury(),responseTime:20}),retrievedAt:at};
 const window={start:'2026-09-01',end:'2026-09-30'};
 const same=compareSourceRevisions('treasury','treasury.notes',previous,current,window);
 assert.equal(same.raw_bytes_changed,true);assert.deepEqual(same.changes,[]);
 const changed=treasury();changed.data[0].avg_interest_rate_amt='4.126';current.bytes=buf(changed);
 const r=compareSourceRevisions('treasury','treasury.notes',previous,current,window);
 assert.equal(r.changes[0].state,'changed');assert.equal(r.qualification,'pending_independent_review');
 assert.throws(()=>compareSourceRevisions('treasury','treasury.notes',previous,current,{start:'2025-01-01',end:'2025-02-01'}),/REVISION_COVERAGE/);
});
