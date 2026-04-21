module.exports = function calculateRisk(score, emissions) {
  if (score >= 80 && emissions < 10000) return "Low";
  if (score >= 60 && emissions < 20000) return "Medium";
  return "High";
};