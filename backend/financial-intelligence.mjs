// CERTIS deterministic financial reference calculations.
// PUBLIC, historical, unscored. This module does not forecast, recommend trades,
// grant entitlement, score evidence, query providers, or access customer accounts.
const METRICS = Object.freeze({short:'BC_2YEAR',long:'BC_10YEAR'});
const BPS = /^([0-9]{1,2})\.([0-9]{2})$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function parseBasisPoints(v) {
  if (typeof v !== 'string') return null;
  const m = BPS.exec(v);
  if (!m) return null;
  const n = BigInt(m[1])*100n + BigInt(m[2]);
  return n <= 10000n ? n : null;
}
function uniqueObservation(source,metric) {
  const matches = source.observations.filter(x=>x.metric===metric);
  if(matches.length!==1)return null;
  const o=matches[0];
  if (o.unit!=='percent_par_yield'||o.classification!=='source_reported'||typeof o.evidence_id!=='string'||!/^public-[a-f0-9]{32}$/.test(o.evidence_id)||o.observation_period!==source.observation_date)return null;
  const bps=parseBasisPoints(o.value);
  return bps===null?null:{bps,id:o.evidence_id};
}
export function deriveFinancialReferences(snapshots,sourceSummaries) {
  if(!Array.isArray(snapshots)||!Array.isArray(sourceSummaries))return [];
  const selected=snapshots.filter(x=>x?.source_id==='treasury-2026');
  const statuses=sourceSummaries.filter(x=>x?.source_id==='treasury-2026');
  if(selected.length!==1||statuses.length!==1)return [];
  const s=selected[0],state=statuses[0];
  if(!Array.isArray(s.observations)||!ISO_DAY.test(s.observation_date||'')||!Number.isFinite(Date.parse(s.observation_date+'T00:00:00Z'))||s.observation_date!==state.observation_date||!['within_review_window','refresh_due','stale'].includes(state.freshness))return [];
  if(typeof s.raw_sha256!=='string'||!(/^[a-f0-9]{64}$/).test(s.raw_sha256)||s.raw_sha256!==state.raw_sha256)return [];
  const a=uniqueObservation(s,METRICS.short),b=uniqueObservation(s,METRICS.long);
  if(!a||!b||a.id===b.id)return [];
  const spread=b.bps-a.bps;
  return [{
    metric:'U.S. Treasury 10-year minus 2-year reference yield',
    value:String(spread),unit:'basis_points',observation_date:s.observation_date,
    source_id:s.source_id,source_sha256:s.raw_sha256,
    evidence_ids:[a.id,b.id],
    method:'(10-year par yield - 2-year par yield) x 100 basis points per percentage point',
    scope:'descriptive_arithmetic_only',
    freshness:state.freshness,
    assessment_state:'not_supported',financial_action_authority:'none'
  }];
}
export function financialEvidenceGaps(sourceSummaries,calculations) {
  if(!Array.isArray(sourceSummaries)||!Array.isArray(calculations))throw Error('FINANCIAL_EVIDENCE_INVALID');
  const gaps=[
    'No current, independently corroborated equity or fund pricing, issuer filings, valuation, or liquidity assessment is admitted.',
    'Treasury reference yields do not establish an executable bond price, credit risk, duration, total return, or investor suitability.',
    'One CPI index observation is not an inflation trend; comparable prior periods and release verification are needed.',
    'Cross-source contradictions, economic scenarios, uncertainty ranges, and decision-specific risk have not been independently assessed.'
  ];
  const treas=sourceSummaries.find(x=>x.source_id==='treasury-2026');
  const bls=sourceSummaries.find(x=>x.source_id==='bls-cpi');
  if(!treas||!bls)gaps.unshift('Required Treasury or consumer-price source coverage is missing.');
  if(sourceSummaries.some(s=>s.freshness!=='within_review_window'))gaps.unshift('At least one financial source is historical, stale, or due for a verified refresh; do not present it as live.');
  if(!calculations.length)gaps.push('A same-date, correctly attributed two-year/ten-year Treasury spread could not be computed.');
  return gaps;
}
