import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePacket,projectExport,reviewPacket,validateDelivery,digest} from './contract.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-20T12:00:00.000Z');
const delivery=f=>({schema:'eue-saved-evidence-delivery/1',request_id:f.packet.request_id,evidence_packet:f.packet,review:f.review});

test('saved golden packet has deterministic digest, old evidence and no certified interpretation',()=>{
 const f=fixture();assert.deepEqual(validatePacket(f.packet,now),f.packet);
 assert.deepEqual(reviewPacket(f.packet,f.packet.issued_at),f.review);
 assert.equal(digest(f.packet),f.review.evidence_packet_sha256);
 assert.deepEqual(validateDelivery(delivery(f),now),f.review);
 assert.equal(f.review.interpretation_executed,false);assert.equal(f.review.state,'HOLD');assert.equal(f.review.knowledge_state,'OUTDATED');
});

test('private report context, addresses and payload fetch targets never enter the projection',()=>{
 const f=fixture(),r=f.report;
 const exported={schema:'landitrus-owned-evidence/1',report_id:r.reportId,report_sha256:f.consent.reportSha256,generated_at:r.generatedAt,
  authorization:f.packet.authorization,evidence:r.evidence,acquisition:r.acquisition,action_authority:'NONE',interpretation:'NOT_EXECUTED',limitation:'not executed'};
 const packet=projectExport(exported,f.packet.issued_at);assert.deepEqual(packet,f.packet);
 for(const privateValue of [r.address,r.provenance.principalId,r.provenance.sessionId,r.evidence[0].sourceUri,r.evidence[0].payloadRef,r.evidence[0].addressKey,r.acquisition[0].message]){
  assert.equal(JSON.stringify(packet).includes(privateValue),false);
 }
 assert.deepEqual(packet.evidence[0].numericFacts,r.evidence[0].numericFacts);
 assert.deepEqual(packet.evidence[0].authorityLimitations,r.evidence[0].authorityLimitations);
});

test('scope, missing consent binding, extra fields, aliases, invalid dates and nested disclosures fail closed',()=>{
 const changes=[p=>p.consumer='CERTIS',p=>p.purpose='TRADE',p=>p.data_classification='SYNTHETIC',p=>p.authorization.consumer='OTHER',
  p=>p.authorization.report_sha256='0'.repeat(64),p=>p.authorization.request_id='OTHER',p=>p.report.report_id=[p.report.report_id],
  p=>p.address='private',p=>p.issued_at='2026-02-31T12:00:00.000Z',p=>p.issued_at='2026-10-20T12:00:01.000Z',
  p=>p.evidence.push(structuredClone(p.evidence[0])),p=>p.evidence[0].payloadHash='invalid',p=>p.evidence[0].sourceUri='https://example.invalid',
  p=>p.evidence[0].numericFacts[0].secret='PRIVATE',p=>p.evidence[0].numericFacts[0].factType='MARKET_PRICE',
  p=>p.evidence[0].temporal.secret='PRIVATE',p=>p.evidence[0].observedAt='2026-10-08T12:00:00.000Z',
  p=>p.evidence[0].acquiredAt='2026-10-08T12:00:00.000Z',p=>p.acquisition[0].evidenceCount=true,p=>p.acquisition.push(structuredClone(p.acquisition[0]))];
 for(const [index,change] of changes.entries()){const p=fixture().packet;change(p);assert.throws(()=>validatePacket(p,now),`mutation ${index}`);}
 assert.throws(()=>validatePacket(fixture().packet,now+121000));
});

test('fresh, absent, undated, unavailable and conflicting metadata preserve uncertainty without acquiring evidence',()=>{
 const f=fixture(),p=f.packet;
 p.evidence[0].acquiredAt=p.evidence[0].observedAt=p.report.generated_at=p.issued_at;
 let review=reviewPacket(p,p.issued_at);assert.equal(review.knowledge_state,'UNKNOWN');assert.equal(review.state,'HOLD');
 p.evidence[0].observedAt=null;p.acquisition[0].status='UNAVAILABLE';
 review=reviewPacket(p,p.issued_at);assert.ok(review.reason_codes.includes('OBSERVATION_TIME_UNKNOWN'));assert.ok(review.reason_codes.includes('REQUIRED_SOURCE_UNAVAILABLE'));
 p.evidence[0].findings.push({...p.evidence[0].findings[0],established:false});
 p.evidence[0].numericFacts.push({...p.evidence[0].numericFacts[0],value:'999.00'});
 assert.deepEqual(validatePacket(p,now).evidence[0].findings,p.evidence[0].findings);
 assert.deepEqual(reviewPacket(p,p.issued_at).claims,[]);
 p.evidence=[];assert.ok(reviewPacket(p,p.issued_at).reason_codes.includes('NO_EVIDENCE'));
});

test('consumer recomputes complete lineage, digest, uncertainty and denied authority',()=>{
 const changes=[b=>b.review.state='REVIEWABLE',b=>b.review.interpretation_executed=true,b=>b.review.claims=[{value:'price forecast'}],
  b=>b.review.financial_action_authority='TRADE',b=>b.review.evidence_strength=100,b=>b.review.source_qualification='CERTIFIED',
  b=>b.review.knowledge_state='KNOWN',b=>b.review.lineage[0].payload_sha256='0'.repeat(64),b=>b.review.lineage[0].authority_limitations=[],
  b=>b.review.evidence_packet_sha256='a'.repeat(64),b=>b.review.report_sha256='a'.repeat(64),b=>b.review.reason_codes=[],
  b=>b.evidence_packet.evidence[0].numericFacts[0].factType='MARKET_VALUE',b=>b.review.evaluated_at='2026-10-20T11:59:59.000Z',
  b=>b.request_id='OTHER'];
 for(const change of changes){const b=delivery(fixture());change(b);assert.throws(()=>validateDelivery(b,now));}
});
