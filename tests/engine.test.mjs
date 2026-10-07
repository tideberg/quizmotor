import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuizStore } from '../server/engine.mjs';
function fixture(t) { const dir=mkdtempSync(join(tmpdir(),'quiz-test-'));let now=1000000;let store=createQuizStore(join(dir,'quiz.sqlite'),()=>now);t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {get s(){return store;},advance(ms){now+=ms;},reopen(){store.close();store=createQuizStore(join(dir,'quiz.sqlite'),()=>now);},dir}; }
function joinTeam(s,name='Testlaget'){return s.command('join',{code:s.snapshot().code,name});}
function prepare(s,index=0){const q=s.snapshot({host:true}).questions[index];s.command('prepare',{id:q.id});return s.snapshot({host:true}).round;}
function answer(s,token,text='Svamp'){return s.command('answer',{roundId:s.active().id,text},token).answer;}

test('removing a team clears its results and credentials durably, preserving other teams', t => {
 const f=fixture(t),s=f.s,a=joinTeam(s,'Testlag'),b=joinTeam(s,'Spelare');
 const teamId=s.snapshot({credential:a.token}).me.id;
 s.command('adjust',{teamId,delta:200,reason:'Test',requestId:'seed'});
 const otherId=s.snapshot({credential:b.token}).me.id;
 s.command('adjust',{teamId:otherId,delta:300,reason:'Test',requestId:'other-seed'});
 prepare(s,2);
 const roundId=s.active().id;
 s.command('bet',{roundId,amount:100},a.token);
 s.command('bet',{roundId,amount:0},b.token);
 s.command('start');answer(s,a.token);answer(s,b.token);s.command('close');
 s.command('grade',{roundId,teamId,correct:true});
 const otherBefore=s.snapshot({credential:b.token}).me;
 assert.throws(()=>s.command('removeTeam',{teamId}),/Bekräfta/);
 assert.equal(s.snapshot().teams.length,2);
 s.command('removeTeam',{teamId,confirm:true});
 const round=s.active();
 assert.ok(round.answers.every(a=>a.teamId!==teamId));
 assert.ok(round.bets.every(b=>b.teamId!==teamId));
 assert.ok(round.scoring.events.every(e=>e.teamId!==teamId));
 assert.ok(!round.scoring.order.includes(teamId));
 assert.deepEqual(s.snapshot({host:true}).adjustments.map(a=>a.teamId),[otherId]);
 assert.deepEqual(s.snapshot({credential:b.token}).me,otherBefore);
 const remaining=round.answers[0];
 s.command('grade',{roundId,teamId:remaining.teamId,correct:true});
 s.command('leaderboard');f.advance(20000);s.command('reveal');
 f.reopen();
 assert.equal(f.s.snapshot().teams.length,1);
 assert.equal(f.s.snapshot({credential:a.token}).me,null);
 assert.throws(()=>f.s.teamFor(a.token),/Anslut/);
 assert.throws(()=>f.s.command('recoverTeam',{code:f.s.snapshot().code,recovery:a.recovery}),/stämmer/);
 assert.ok(joinTeam(f.s,'Testlag').token);
});

test('server time locks descending points; duplicate answers return the durable receipt',t=>{
 const f=fixture(t),s=f.s,team=joinTeam(s);prepare(s);s.command('start');f.advance(60000);
 const a=answer(s,team.token);assert.equal(a.points,50);assert.equal(a.elapsedMs,60000);
 f.advance(10000);const retry=answer(s,team.token,'Changed answer');assert.deepEqual(retry,a);assert.equal(s.active().answers.length,1);
 assert.throws(()=>s.command('answer',{roundId:'previous',text:'Guess'},team.token),/bytts/);
 s.command('close');assert.throws(()=>s.command('reveal'),/Rätta alla/);
 s.command('grade',{roundId:s.active().id,teamId:a.teamId,correct:true});assert.equal(s.snapshot().teams[0].score,0);assert.equal(s.snapshot({host:true}).teams[0].score,50);
 s.command('leaderboard');f.advance(10000);s.command('reveal');assert.equal(s.snapshot().teams[0].score,50);
 s.command('grade',{roundId:s.active().id,teamId:a.teamId,correct:false});assert.equal(s.snapshot().teams[0].score,0);
 s.command('grade',{roundId:s.active().id,teamId:a.teamId,correct:true});assert.equal(s.snapshot().teams[0].score,50);
});
test('pause freezes time, late answers are rejected, bonus has fixed points',t=>{
 const f=fixture(t),s=f.s,team=joinTeam(s);prepare(s);s.command('start');f.advance(30000);s.command('pause');f.advance(60000);
 assert.equal(s.snapshot().round.elapsedMs,30000);assert.throws(()=>answer(s,team.token),/pågår/);
 s.command('resume');f.advance(90000);assert.throws(()=>answer(s,team.token),/pågår/);assert.equal(s.active().status,'closed');s.command('reveal');
 prepare(s,1);s.command('start');f.advance(59000);assert.equal(answer(s,team.token,'42').points,150);
});
test('restart preserves answers and pauses at last checkpoint without counting downtime',t=>{
 const f=fixture(t);const team=joinTeam(f.s);prepare(f.s);f.s.command('start');f.advance(20000);answer(f.s,team.token);f.s.tick();f.advance(180000);f.reopen();
 assert.equal(f.s.active().status,'paused');assert.equal(f.s.snapshot().round.elapsedMs,20000);assert.equal(f.s.snapshot().recovered,true);assert.equal(f.s.active().answers.length,1);assert.equal(f.s.snapshot({credential:team.token}).me.name,'Testlaget');
 f.s.command('resume');f.advance(10000);assert.equal(f.s.snapshot().round.elapsedMs,30000);
});
test('public payload hides answers until closing and keeps facit and credentials private during scoring',t=>{
 const f=fixture(t),s=f.s,a=joinTeam(s,'A'),b=joinTeam(s,'B');prepare(s);let pub=s.snapshot();assert.equal(pub.round.question.prompt,undefined);assert.equal(pub.questions,undefined);
 s.command('start');answer(s,a.token,'Secret answer');assert.ok(!JSON.stringify(s.snapshot()).includes('Secret answer'));s.command('close');s.command('grade',{roundId:s.active().id,teamId:s.active().answers[0].teamId,correct:true});
 pub=s.snapshot({credential:b.token});assert.equal(pub.round.question.answer,undefined);assert.equal(pub.round.answers,undefined);assert.equal(pub.round.question.audio,undefined);assert.equal(pub.me.answer,null);assert.equal(pub.teams[0].score,0);assert.equal(pub.teams[0].recovery,undefined);assert.ok(!JSON.stringify(pub).includes(a.token));assert.equal(pub.teams.find(t=>t.name==='A').roundResult.text,'Secret answer');
 assert.equal(s.snapshot({credential:a.token}).me.answer.correct,null);
});
test('wagers lock before question, enforce balance, settle wins and missing answers once',t=>{
 const f=fixture(t),s=f.s,a=joinTeam(s,'A'),b=joinTeam(s,'B'),c=joinTeam(s,'C');
 const teams=s.snapshot().teams;for(const team of teams)s.command('adjust',{teamId:team.id,delta:200,reason:'Seed',requestId:team.id});
 prepare(s,2);assert.equal(s.snapshot().round.question.prompt,undefined);
 const roundId=s.active().id;assert.throws(()=>s.command('bet',{roundId,amount:201},a.token),/heltal/);assert.throws(()=>s.command('bet',{roundId,amount:-1},a.token),/heltal/);
 s.command('bet',{roundId,amount:125},a.token);s.command('bet',{roundId,amount:75},b.token);assert.equal(s.command('bet',{roundId,amount:5},a.token).bet.amount,125);
 s.command('start');assert.equal(s.snapshot({credential:c.token}).me.bet.amount,0);assert.throws(()=>s.command('bet',{roundId,amount:5},joinTeam(s,'Late').token),/stängd/);
 const aAnswer=answer(s,a.token,'Roxette');assert.equal(aAnswer.points,125);f.advance(60000);s.tick();
 assert.equal(s.active().answers.find(x=>x.teamId===teams.find(t=>t.name==='B').id).correct,false);
 s.command('grade',{roundId,teamId:aAnswer.teamId,correct:true});s.command('leaderboard');f.advance(20000);s.command('reveal');
 const scores=Object.fromEntries(s.snapshot().teams.map(t=>[t.name,t.score]));assert.equal(scores.A,325);assert.equal(scores.B,125);assert.equal(scores.C,200);
 assert.throws(()=>s.command('reveal'),/Stäng/);assert.equal(s.snapshot().teams.find(t=>t.name==='A').score,325);
});
test('adjustments are idempotent, invalid edits roll back, played questions cannot change',t=>{
 const f=fixture(t),s=f.s;joinTeam(s);const teamId=s.snapshot().teams[0].id;
 const p={teamId,delta:30,reason:'Alternative spelling',requestId:'one'};s.command('adjust',p);s.command('adjust',p);assert.equal(s.snapshot().teams[0].score,30);
 const before=s.snapshot({host:true}).questions;assert.throws(()=>s.command('saveQuestion',{...before[0],duration:0}),/heltal/);assert.deepEqual(s.snapshot({host:true}).questions,before);
 prepare(s);assert.throws(()=>s.command('saveQuestion',before[0]),/förberetts/);assert.throws(()=>s.command('prepare',{id:before[1].id}),/Avsluta/);
});
test('recovery survives restart; new event archives results and keeps question media',async t=>{
 const f=fixture(t),team=joinTeam(f.s);f.reopen();assert.equal(f.s.command('recoverTeam',{code:f.s.snapshot().code,recovery:team.recovery}).token,team.token);
 assert.throws(()=>f.s.command('recoverTeam',{code:f.s.snapshot().code,recovery:'wrong'}),/stämmer/);
 const before=f.s.export(),backup=await f.s.backup();assert.ok(backup.endsWith('.sqlite'));
 const copied=createQuizStore(backup);assert.equal(copied.snapshot().teams.length,1);copied.close();
 assert.throws(()=>f.s.command('reset',{confirm:'yes'}),/NY OMGÅNG/);f.s.command('reset',{confirm:'NY OMGÅNG'});assert.equal(f.s.snapshot().teams.length,0);assert.deepEqual(f.s.snapshot({host:true}).questions,before.questions);assert.notEqual(f.s.snapshot().id,before.id);
});
test('unprepare is safe before play; a locked wager cannot be discarded; sleep recovery pauses',t=>{
 const f=fixture(t),s=f.s,team=joinTeam(s);prepare(s);s.command('unprepare');assert.equal(s.active(),undefined);assert.equal(s.snapshot({host:true}).rounds.length,0);
 prepare(s,2);s.command('bet',{roundId:s.active().id,amount:0},team.token);assert.throws(()=>s.command('unprepare'),/satsat/);
 s.command('start');f.advance(12000);s.tick();f.advance(3600000);s.command('pause',{atCheckpoint:true});assert.equal(s.active().status,'paused');assert.equal(s.snapshot().round.elapsedMs,12000);
});

test('rehearsal rotates answers, respects pause and stop, survives restart and resets', t => {
 const f=fixture(t),s=f.s;
 s.command('rehearsal',{enabled:true,count:5});
 s.command('rehearsal',{enabled:true,count:6});
 assert.equal(s.snapshot().teams.length,5);
 assert.equal(s.snapshot().rehearsal,undefined);
 prepare(s);s.command('start');
 f.advance(20000);s.tick();
 assert.ok(s.active().answers.length>0 && s.active().answers.length<5);
 s.command('pause');const count=s.active().answers.length;f.advance(20000);s.tick();assert.equal(s.active().answers.length,count);
 s.command('rehearsal',{enabled:false});s.command('resume');f.advance(20000);s.tick();assert.equal(s.active().answers.length,count);
 s.command('rehearsal',{enabled:true});f.advance(65000);s.tick();
 assert.equal(s.active().answers.length,5);
 assert.equal(s.active().answers.filter(a=>a.text===s.active().question.answer).length,4);
 assert.ok(s.active().answers.every(a=>a.correct===null));
 assert.ok(new Set(s.active().answers.map(a=>a.points)).size>1);
 s.tick();assert.equal(s.active().answers.length,5);
 f.reopen();assert.equal(f.s.snapshot({host:true}).rehearsal.enabled,true);
 f.s.command('reset',{confirm:'NY OMGÅNG'});assert.equal(f.s.snapshot({host:true}).rehearsal.count,0);
});

test('rehearsal uses legal varied bets, missing final answers and shortened countdown',t=>{
 const f=fixture(t),s=f.s;
 s.command('rehearsal',{enabled:true,count:6});
 for(const team of s.snapshot().teams)s.command('adjust',{teamId:team.id,delta:100,reason:'Test',requestId:team.id});
 // Make the final the third prepared question, with no prior answers.
 for(let i=0;i<2;i++){prepare(s,i);s.command('start');s.command('close');s.command('reveal');}
 prepare(s,2);s.tick();
 assert.deepEqual([...new Set(s.active().bets.map(b=>b.amount))].sort((a,b)=>a-b),[0,25,50,75,100]);
 s.command('start');s.command('countdown');
 for(let i=0;i<10;i++){f.advance(1000);s.tick();}
 assert.equal(s.active().status,'closed');
 assert.equal(s.active().answers.filter(a=>a.automatic).length,1);
 assert.equal(s.active().answers.filter(a=>!a.automatic).length,5);
 assert.throws(()=>s.command('rehearsal',{enabled:'yes'}));
});
