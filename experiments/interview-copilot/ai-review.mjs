export function aiReview(session){
  const turns=session.turns.map(t=>({...t,evaluation:t.coaching?.evaluation||null}));
  const scored=turns.filter(t=>t.evaluation);
  const complete=scored.length===turns.length&&turns.length>0;
  return {provider:'deepseek',ai_status:complete?'completed':'incomplete',score:complete?Math.round(scored.reduce((n,t)=>n+t.evaluation.score,0)/scored.length):null,graded:scored.length,total:turns.length,turns};
}
