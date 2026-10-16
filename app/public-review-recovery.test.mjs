import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observationLabel,observationValue,dateLabel} from './review-presentation.mjs';
import {snapshots} from '../backend/public-reviews.mjs';
test('all historical planning codes have plain labels and cannot read as verified property facts',()=>{
 const rows=snapshots['dallas-matrix'].observations;assert.equal(rows.length,32);
 for(const row of rows){assert.doesNotMatch(observationLabel(row),/^EV-/);assert.equal(observationValue(row),'Not verified for this property');}
});
test('numeric zero and period precision survive readable public snapshot display',()=>{
 assert.equal(observationValue({value:'0',unit:'USD'}),'$0.00');
 assert.equal(observationValue({value:'2027',unit:'appraisal_year'}),'2027 appraisal-year label');
 assert.equal(dateLabel('2023'),'2023');
});
test('public entry distinguishes fixed dated records from new property acquisition',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/fixed, dated public records/);assert.match(html,/does not retrieve a new property report/);
});
