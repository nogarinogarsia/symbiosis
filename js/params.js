// 사용자가 조정 가능한 게임 파라미터 (대부분 [제안] 기본값 — 확정 밸런스 아님)
export const PARAMS = {
  breedCooldownMs: 24 * 3600e3,       // [확정] 교배 후 24시간
  growthWindowMs: 3600e3,             // [확정] 탄생 후 1시간 돌봄으로 성격 결정
  specialChance: 0.005,               // [제안] SPECIAL 4종 합계
  fantasyChanceOnMythical: 0.10,      // [제안] 미시컬(최고등급)에서만
  // [확정] 같은 등급 부모일 때만, 커먼~미시컬 (%)
  costumeChanceByGrade: [0.01, 0.02, 0.03, 0.05, 0.08, 0.10, 0.10],
  // 일반 7등급 목표 출현률(창업 풀 기준 캘리브레이션) [제안]
  gradeTargets: [0.38, 0.24, 0.18, 0.11, 0.06, 0.025, 0.005],
  bodyMutationSigma: 0.08,            // 외형 파라미터 변이 [확정: 유전+약간의 변이]
  // 경제 [제안]
  incomePerHourByGrade: [1, 2, 4, 8, 16, 32, 64],
  incomeSpecialPerHour: 40,
  incomeCapHours: 24,
  sellPriceByGrade: [10, 25, 60, 150, 400, 1000, 3000],
  sellSpecial: 2500,
  fantasyPriceMult: 2,
  carrierBonusRate: 0.15,             // 숨은 열성 유전자 1개당 가격 +15%
  shopBreedMult: 1.5,
  dexRewardByGrade: [5, 10, 20, 40, 80, 160, 320],
  dexRewardSpecial: 500,
  dexMilestoneEvery: 25,
  dexMilestoneReward: 200,
  shopSize: 8,
  startCoins: 200,
};

export const GRADES = ['커먼', '언커먼', '레어', '에픽', '유니크', '레전더리', '미시컬'];
export const GRADE_COLORS = ['#a9a18f', '#7bbf6a', '#5aa9e6', '#b07be0', '#f2a33a', '#e8625f', '#ff7fc0'];
