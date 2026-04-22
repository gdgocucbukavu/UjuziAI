export const DEFAULT_JUDGE_CRITERIA = [
  { key: 'innovation', label: 'Innovation', max: 100 },
  { key: 'impact', label: 'Impact', max: 100 },
  { key: 'technicalQuality', label: 'Qualite technique', max: 100 },
  { key: 'clarity', label: 'Clarte du projet', max: 100 },
  { key: 'designUx', label: 'Design / UX', max: 100 },
  { key: 'cloudRunDeployment', label: 'Deploiement sur Cloud Run', max: 100 },
];

export function normalizeJudgeCriteria(inputCriteria) {
  const source = Array.isArray(inputCriteria) && inputCriteria.length > 0
    ? inputCriteria
    : DEFAULT_JUDGE_CRITERIA;

  return source.map((criterion, index) => {
    const key = String(criterion?.key || `criterion_${index + 1}`).trim();
    const label = String(criterion?.label || key || `Critere ${index + 1}`).trim();
    const maxRaw = Number(criterion?.max);
    const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 100;

    return {
      key,
      label,
      max,
    };
  });
}

export function computeJudgeScore(criteria, criteriaScores = {}) {
  const normalizedCriteria = normalizeJudgeCriteria(criteria);

  const scoreByCriterion = {};
  let totalScore = 0;

  normalizedCriteria.forEach((criterion) => {
    const rawValue = Number(criteriaScores?.[criterion.key]);
    const safeValue = Number.isFinite(rawValue)
      ? Math.max(0, Math.min(criterion.max, rawValue))
      : 0;
    scoreByCriterion[criterion.key] = safeValue;
    totalScore += safeValue;
  });

  const averageScore = normalizedCriteria.length > 0
    ? totalScore / normalizedCriteria.length
    : 0;

  return {
    criteria: normalizedCriteria,
    scoreByCriterion,
    totalScore,
    averageScore,
  };
}

export function aggregateJudgeScores(scoreDocs = []) {
  const validScores = (Array.isArray(scoreDocs) ? scoreDocs : [])
    .map((item) => Number(item?.totalScore))
    .filter((value) => Number.isFinite(value));

  const judgeScoreCount = validScores.length;
  const judgeScoreTotal = validScores.reduce((sum, value) => sum + value, 0);
  const judgeScoreAverage = judgeScoreCount > 0 ? judgeScoreTotal / judgeScoreCount : 0;

  return {
    judgeScoreCount,
    judgeScoreTotal,
    judgeScoreAverage,
  };
}
