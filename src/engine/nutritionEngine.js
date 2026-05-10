import { FOODS } from '../data/foods';

const ACTIVITY_MULTIPLIERS = {
  low: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

const GOAL_PROFILES = {
  weight_loss: { calorieShift: -0.18, proteinPerKg: 1.7, fatRatio: 0.28, tagBoosts: ['weight_loss', 'satiety', 'gut'] },
  mood: { calorieShift: 0, proteinPerKg: 1.4, fatRatio: 0.3, tagBoosts: ['mood', 'omega3', 'gut'] },
  skin: { calorieShift: 0, proteinPerKg: 1.4, fatRatio: 0.32, tagBoosts: ['skin', 'antioxidant', 'healthy_aging'] },
  hair: { calorieShift: 0, proteinPerKg: 1.5, fatRatio: 0.3, tagBoosts: ['hair', 'strength'] },
  strength: { calorieShift: 0.08, proteinPerKg: 1.9, fatRatio: 0.27, tagBoosts: ['strength', 'protein'] },
  healthy_aging: { calorieShift: 0, proteinPerKg: 1.5, fatRatio: 0.32, tagBoosts: ['healthy_aging', 'heart', 'antioxidant'] },
};

export function calculateBmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === 'female' ? -161 : 5));
}

export function calculatePlanTargets(profile) {
  const safeProfile = {
    sex: profile.sex || 'male',
    weightKg: Number(profile.weightKg) || 80,
    heightCm: Number(profile.heightCm) || 178,
    age: Number(profile.age) || 30,
    activity: profile.activity || 'light',
    goal: profile.goal || 'weight_loss',
  };
  const goalProfile = GOAL_PROFILES[safeProfile.goal] || GOAL_PROFILES.weight_loss;
  const bmr = calculateBmr(safeProfile);
  const tdee = Math.round(bmr * (ACTIVITY_MULTIPLIERS[safeProfile.activity] || ACTIVITY_MULTIPLIERS.light));
  const calories = Math.round(Math.max(1200, tdee * (1 + goalProfile.calorieShift)));
  const protein = Math.round(safeProfile.weightKg * goalProfile.proteinPerKg);
  const fat = Math.round((calories * goalProfile.fatRatio) / 9);
  const carbs = Math.round(Math.max(60, (calories - protein * 4 - fat * 9) / 4));
  const fiber = safeProfile.sex === 'female' ? 25 : 38;
  return { bmr, tdee, calories, protein, fat, carbs, fiber };
}

export function scoreFoods(goal, interests = []) {
  const goalProfile = GOAL_PROFILES[goal] || GOAL_PROFILES.weight_loss;
  return FOODS.map((food) => {
    const tagScore = food.tags.reduce((sum, tag) => {
      const goalHit = goalProfile.tagBoosts.includes(tag) || tag === goal;
      const interestHit = interests.includes(tag) || interests.includes(food.category) || interests.includes(food.id);
      return sum + (goalHit ? 18 : 0) + (interestHit ? 12 : 0);
    }, 0);
    const proteinScore = goal === 'strength' || goal === 'weight_loss' ? Math.min(20, food.protein * 0.7) : Math.min(10, food.protein * 0.3);
    const fiberScore = Math.min(18, food.fiber * 1.8);
    const caloriePenalty = goal === 'weight_loss' ? Math.max(0, (food.calories - 180) / 35) : 0;
    return { ...food, planScore: Math.round(food.densityScore + tagScore + proteinScore + fiberScore - caloriePenalty) };
  }).sort((a, b) => b.planScore - a.planScore);
}

function mealSchedule(mealsPerDay) {
  if (mealsPerDay <= 2) return [
    { name: 'Brunch', share: 0.46, kind: 'main' },
    { name: 'Dinner', share: 0.54, kind: 'main' },
  ];
  if (mealsPerDay === 3) return [
    { name: 'Breakfast', share: 0.3, kind: 'main' },
    { name: 'Lunch', share: 0.35, kind: 'main' },
    { name: 'Dinner', share: 0.35, kind: 'main' },
  ];
  if (mealsPerDay === 4) return [
    { name: 'Breakfast', share: 0.25, kind: 'main' },
    { name: 'Lunch', share: 0.32, kind: 'main' },
    { name: 'Afternoon snack', share: 0.13, kind: 'snack' },
    { name: 'Dinner', share: 0.3, kind: 'main' },
  ];
  return [
    { name: 'Breakfast', share: 0.22, kind: 'main' },
    { name: 'Morning snack', share: 0.1, kind: 'snack' },
    { name: 'Lunch', share: 0.28, kind: 'main' },
    { name: 'Afternoon snack', share: 0.12, kind: 'snack' },
    { name: 'Dinner', share: 0.28, kind: 'main' },
  ];
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function generateDailyPlan(profile, interests = []) {
  const targets = calculatePlanTargets(profile);
  const mealsPerDay = Math.min(5, Math.max(2, Number(profile.mealsPerDay) || 3));
  const ranked = scoreFoods(profile.goal, interests);
  const proteins = ranked.filter(f => f.protein >= 9);
  const plants = ranked.filter(f => f.fiber >= 2 || f.category.includes('Fruit') || f.category.includes('vegetable'));
  const drinks = ranked.filter(f => f.category === 'Drink');
  const fats = ranked.filter(f => f.fat >= 10 && f.calories >= 100);
  const snackFoods = ranked.filter(f =>
    f.category.includes('Fruit') ||
    f.category.includes('Drink') ||
    f.category.includes('Nut') ||
    f.category.includes('Seed') ||
    f.category.includes('Dairy') ||
    f.category.includes('fermented') ||
    f.id.includes('yogurt') ||
    f.id.includes('chocolate')
  );
  const schedule = mealSchedule(mealsPerDay);
  const meals = schedule.map((slot, index) => {
    const calorieShare = slot.share;
    const mealCalories = Math.round(targets.calories * calorieShare);
    const isSnack = slot.kind === 'snack';
    const protein = proteins[index % proteins.length] || ranked[index % ranked.length];
    const plant = plants[(index + 1) % plants.length] || ranked[(index + 2) % ranked.length];
    const booster = index % 3 === 0 ? (fats[index % fats.length] || ranked[0]) : ranked[(index + 3) % ranked.length];
    const snackA = snackFoods[index % snackFoods.length] || plant;
    const snackB = snackFoods[(index + 2) % snackFoods.length] || drinks[0] || ranked[index % ranked.length];
    const drink = drinks[index % drinks.length] || null;
    const items = isSnack
      ? uniqueItems([snackA, snackB].filter(Boolean)).slice(0, 2)
      : uniqueItems([protein, plant, booster, drink].filter(Boolean)).slice(0, 4);
    const approxProtein = Math.round(items.reduce((sum, item) => sum + item.protein, 0));
    const approxFiber = Math.round(items.reduce((sum, item) => sum + item.fiber, 0));
    return {
      id: `meal_${index}`,
      name: slot.name,
      calories: mealCalories,
      protein: approxProtein,
      fiber: approxFiber,
      items,
      why: buildMealWhy(profile.goal, items),
    };
  });
  return { targets, rankedFoods: ranked, meals };
}

export function generateWeeklyPlan(profile, interests = []) {
  const days = [];
  const usedIds = new Set();
  for (let d = 0; d < 7; d++) {
    const shifted = { ...profile, _daySeed: d };
    const day = generateDailyPlanSeeded(shifted, interests, usedIds, d);
    day.meals.forEach(m => m.items.forEach(it => usedIds.add(it.id)));
    days.push({ dayIndex: d, dayLabel: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d], ...day });
  }
  return days;
}

function generateDailyPlanSeeded(profile, interests, usedIds, daySeed) {
  const targets = calculatePlanTargets(profile);
  const mealsPerDay = Math.min(5, Math.max(2, Number(profile.mealsPerDay) || 3));
  const ranked = scoreFoods(profile.goal, interests);
  const offset = daySeed * 5;
  const proteins = ranked.filter(f => f.protein >= 9);
  const plants = ranked.filter(f => f.fiber >= 2 || f.category.includes('Fruit') || f.category.includes('vegetable'));
  const drinks = ranked.filter(f => f.category === 'Drink');
  const fats = ranked.filter(f => f.fat >= 10 && f.calories >= 100);
  const snackFoods = ranked.filter(f =>
    f.category.includes('Fruit') || f.category.includes('Drink') || f.category.includes('Nut') ||
    f.category.includes('Seed') || f.category.includes('Dairy') || f.category.includes('fermented') ||
    f.id.includes('yogurt') || f.id.includes('chocolate')
  );
  const schedule = mealSchedule(mealsPerDay);
  const meals = schedule.map((slot, index) => {
    const i = (index + offset) % ranked.length;
    const mealCalories = Math.round(targets.calories * slot.share);
    const isSnack = slot.kind === 'snack';
    const protein = proteins[(i) % proteins.length] || ranked[i % ranked.length];
    const plant = plants[(i + 1) % plants.length] || ranked[(i + 2) % ranked.length];
    const booster = i % 3 === 0 ? (fats[i % fats.length] || ranked[0]) : ranked[(i + 3) % ranked.length];
    const snackA = snackFoods[i % snackFoods.length] || plant;
    const snackB = snackFoods[(i + 2) % snackFoods.length] || drinks[0] || ranked[i % ranked.length];
    const drink = drinks[i % drinks.length] || null;
    const items = isSnack
      ? uniqueItems([snackA, snackB].filter(Boolean)).slice(0, 2)
      : uniqueItems([protein, plant, booster, drink].filter(Boolean)).slice(0, 4);
    return {
      id: `meal_${daySeed}_${index}`,
      name: slot.name,
      calories: mealCalories,
      protein: Math.round(items.reduce((s, it) => s + it.protein, 0)),
      fiber: Math.round(items.reduce((s, it) => s + it.fiber, 0)),
      items,
      why: buildMealWhy(profile.goal, items),
    };
  });
  return { targets, meals };
}

export function buildGroceryList(weeklyPlan) {
  const map = {};
  weeklyPlan.forEach(day => {
    day.meals.forEach(meal => {
      meal.items.forEach(item => {
        if (map[item.id]) { map[item.id].count += 1; }
        else { map[item.id] = { id: item.id, name: item.name, emoji: item.emoji, category: item.category, count: 1 }; }
      });
    });
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}

function buildMealWhy(goal, items) {
  const names = items.map(i => i.name).join(', ');
  const goalText = {
    weight_loss: 'high-satiety protein, fiber, and low-energy-density choices',
    mood: 'steady energy, magnesium/omega-rich foods, and hydration',
    skin: 'antioxidants, vitamin-rich plants, hydration, and skin-supportive fats',
    hair: 'protein, B vitamins, zinc/iron-supportive foods, and healthy fats',
    strength: 'protein distribution, minerals, and training-friendly carbohydrates',
    healthy_aging: 'colorful plants, unsaturated fats, fiber, and micronutrient density',
  }[goal] || 'balanced nutrition';
  return `${names} are paired for ${goalText}.`;
}

export function searchFoods(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return FOODS;
  return FOODS.filter(food => {
    const haystack = [food.name, food.category, food.impact, food.caution, ...food.vitamins, ...food.minerals, ...food.tags].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

export function estimateHydrationLiters(weightKg, activity = 'light') {
  const base = (Number(weightKg) || 75) * 0.033;
  const bump = activity === 'high' ? 0.7 : activity === 'moderate' ? 0.45 : activity === 'light' ? 0.25 : 0;
  return Math.round((base + bump) * 10) / 10;
}
