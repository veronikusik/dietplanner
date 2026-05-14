import { FOODS } from '../data/foods.js';

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

const INTEREST_NUDGES = {
  omega3:      { fatMul: 1.06 },
  gut:         { fiberMul: 1.20 },
  satiety:     { proteinMul: 1.08, fiberMul: 1.10 },
  heart:       { fatMul: 1.04, fiberMul: 1.08 },
  antioxidant: { fiberMul: 1.06 },
  skin:        { fatMul: 1.04 },
  hair:        { proteinMul: 1.05 },
  mood:        { fatMul: 1.03, fiberMul: 1.05 },
};

export function calculatePlanTargets(profile, interests = []) {
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
  let proteinMul = 1, fatMul = 1, fiberMul = 1;
  (interests || []).forEach(i => { const n = INTEREST_NUDGES[i]; if (n) { proteinMul *= (n.proteinMul || 1); fatMul *= (n.fatMul || 1); fiberMul *= (n.fiberMul || 1); } });
  const protein = Math.round(safeProfile.weightKg * goalProfile.proteinPerKg * proteinMul);
  const fat = Math.round((calories * goalProfile.fatRatio * fatMul) / 9);
  const carbs = Math.round(Math.max(60, (calories - protein * 4 - fat * 9) / 4));
  const baseFiber = safeProfile.sex === 'female' ? 25 : 38;
  const fiber = Math.round(baseFiber * fiberMul);
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

/* ── meal slot definitions ──────────────────────────────────────────
 * Each slot has a time-of-day, kind (main/snack), composition roles,
 * and id-level allow/deny lists so foods land in appropriate meals.
 *   - No coffee/yerba/green_tea/matcha at dinner (caffeine + late day)
 *   - No salmon/chicken/beef-liver/kangaroo at breakfast
 *   - Drinks limited to one per main meal
 *   - Snacks are light: fruit/nuts/yogurt/dark chocolate/etc
 */

const ID = {
  // Drinks
  coffee: 'coffee', greenTea: 'green_tea', matcha: 'matcha', yerba: 'yerba_mate', water: 'water', kefir: 'kefir',
};

const CAFFEINATED_DRINKS = new Set(['coffee', 'green_tea', 'matcha', 'yerba_mate']);

const BREAKFAST_PROTEIN_IDS = new Set([
  'eggs', 'greek_yogurt', 'cottage_cheese', 'kefir', 'oats', 'tofu', 'chia_seeds', 'pumpkin_seeds', 'almonds',
  'paneer', 'edamame',
]);

const BREAKFAST_CARB_IDS = new Set([
  'oats', 'maize_porridge', 'fonio', 'sweet_potato', 'bulgur', 'rye_bread', 'quinoa', 'teff_injera', 'tortilla_corn',
  'plantain', 'cassava', 'taro', 'banana',
]);

const FRUIT_CATS = new Set(['Fruit', 'Tropical fruit / fat']);
const PLANT_CATS = new Set(['Leafy green', 'Cruciferous vegetable', 'Vegetable', 'Fruit / vegetable', 'Fermented vegetable', 'Root vegetable', 'Vegetable / fungi', 'Sea vegetable', 'Fermented soy soup', 'Legume dip']);
const FAT_CATS = new Set(['Nut', 'Seed', 'Oil', 'Fruit / healthy fat', 'Seed paste']);
const HEAVY_PROTEIN_CATS = new Set(['Fish', 'Seafood', 'Seafood dish', 'Lean protein', 'Lean game meat', 'Organ meat', 'Lentil dish', 'Legume', 'Soy / legume', 'Soy protein']);
const ALL_PROTEIN_CATS = new Set([...HEAVY_PROTEIN_CATS, 'Protein', 'Dairy / fermented', 'Dairy', 'Fermented dairy', 'Fresh cheese', 'Cheese', 'Broth', 'Whole grain']); // grain only counts when it has decent protein
const CARB_CATS = new Set(['Whole grain', 'Grain staple', 'African ancient grain', 'African fermented grain', 'Noodle / grain', 'Root staple', 'Starchy vegetable', 'Tropical starch', 'Whole grain bread', 'Maize staple']);

const SNACK_ALLOW_IDS = new Set([
  'apple', 'banana', 'blueberries', 'kiwi', 'orange', 'strawberries', 'watermelon',
  'almonds', 'walnuts', 'chia_seeds', 'pumpkin_seeds',
  'greek_yogurt', 'kefir', 'cottage_cheese', 'hummus', 'edamame', 'dark_chocolate', 'kimchi', 'sauerkraut',
  'tahini', 'coconut',
]);

const DINNER_DENY_IDS = new Set(['coffee', 'green_tea', 'matcha', 'yerba_mate', 'dark_chocolate']);
const DINNER_DENY_CATS = new Set(['Treat']);

const BREAKFAST_DENY_CATS = new Set(['Fish', 'Seafood', 'Seafood dish', 'Lean protein', 'Lean game meat', 'Organ meat', 'Cheese']);

const SLOT_DEFS = {
  Breakfast: { kind: 'main', time: 'morning', share3: 0.30, share4: 0.25, share5: 0.22, drinkPool: ['coffee', 'green_tea', 'matcha', 'yerba_mate', 'kefir', 'water'], roles: ['breakfast_protein', 'breakfast_carb', 'fruit', 'drink'] },
  Brunch:    { kind: 'main', time: 'morning', share2: 0.46,                                     drinkPool: ['coffee', 'green_tea', 'matcha', 'kefir', 'water'],          roles: ['breakfast_protein', 'breakfast_carb', 'plant', 'drink'] },
  Lunch:     { kind: 'main', time: 'midday',  share3: 0.35, share4: 0.32, share5: 0.28,         drinkPool: ['water', 'green_tea', 'matcha', 'yerba_mate'],               roles: ['protein', 'carb', 'plant', 'fat'] },
  Dinner:    { kind: 'main', time: 'evening', share2: 0.54, share3: 0.35, share4: 0.30, share5: 0.28, drinkPool: ['water', 'bone_broth', 'kefir'],                       roles: ['protein', 'plant', 'carb_or_plant', 'drink'] },
  'Morning snack':   { kind: 'snack', time: 'morning', share5: 0.10, snackDrinkPool: ['coffee', 'green_tea', 'matcha', 'yerba_mate', 'water'], roles: ['snack_solid', 'snack_drink'] },
  'Afternoon snack': { kind: 'snack', time: 'midday',  share4: 0.13, share5: 0.12, snackDrinkPool: ['green_tea', 'matcha', 'water', 'kefir'],   roles: ['snack_solid', 'snack_solid_alt'] },
};

function mealSchedule(mealsPerDay) {
  if (mealsPerDay <= 2) return ['Brunch', 'Dinner'];
  if (mealsPerDay === 3) return ['Breakfast', 'Lunch', 'Dinner'];
  if (mealsPerDay === 4) return ['Breakfast', 'Lunch', 'Afternoon snack', 'Dinner'];
  return ['Breakfast', 'Morning snack', 'Lunch', 'Afternoon snack', 'Dinner'];
}

function shareFor(slotName, mealsPerDay) {
  const def = SLOT_DEFS[slotName];
  return def[`share${mealsPerDay}`] || def.share3 || 0.25;
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function passesTimeFilter(food, time) {
  if (time === 'evening' && (DINNER_DENY_IDS.has(food.id) || DINNER_DENY_CATS.has(food.category))) return false;
  if (time === 'morning' && BREAKFAST_DENY_CATS.has(food.category)) return false;
  return true;
}

function pickFromPool(ranked, predicate, used, time) {
  for (const f of ranked) {
    if (used.has(f.id)) continue;
    if (!passesTimeFilter(f, time)) continue;
    if (predicate(f)) return f;
  }
  // fallback: ignore "used" but still respect time filter
  for (const f of ranked) {
    if (!passesTimeFilter(f, time)) continue;
    if (predicate(f)) return f;
  }
  return null;
}

const ROLE_PREDICATES = {
  breakfast_protein: f => BREAKFAST_PROTEIN_IDS.has(f.id) || (f.protein >= 9 && (f.category.includes('Dairy') || f.category.includes('fermented') || f.category === 'Protein' || f.category === 'Whole grain' || f.category === 'Soy protein' || f.category === 'Soy / legume')),
  breakfast_carb:    f => BREAKFAST_CARB_IDS.has(f.id) || (CARB_CATS.has(f.category) && f.fiber >= 2),
  protein:           f => f.protein >= 9 && ALL_PROTEIN_CATS.has(f.category) && f.category !== 'Whole grain',
  carb:              f => CARB_CATS.has(f.category) || f.category === 'Legume' || f.category === 'Lentil dish',
  plant:             f => PLANT_CATS.has(f.category) || (f.category === 'Fruit / healthy fat'),
  fruit:             f => FRUIT_CATS.has(f.category) || f.id === 'avocado',
  fat:               f => FAT_CATS.has(f.category),
  carb_or_plant:     f => CARB_CATS.has(f.category) || PLANT_CATS.has(f.category),
  snack_solid:       f => SNACK_ALLOW_IDS.has(f.id),
  snack_solid_alt:   f => SNACK_ALLOW_IDS.has(f.id),
  snack_drink:       () => false, // handled separately
  drink:             () => false, // handled separately
};

function pickDrink(ranked, drinkPool, used) {
  for (const id of drinkPool) {
    if (used.has(id)) continue;
    const f = ranked.find(x => x.id === id);
    if (f) return f;
  }
  // fallback: any drink not yet used
  const anyDrink = ranked.find(x => x.category === 'Drink' && !used.has(x.id));
  if (anyDrink) return anyDrink;
  // last resort: water (may repeat but extremely unlikely)
  return ranked.find(x => x.id === 'water') || null;
}

function buildSlot(slotName, ranked, used, goalProfile) {
  const def = SLOT_DEFS[slotName];
  const isStrength = goalProfile === GOAL_PROFILES.strength;
  const isWeightLoss = goalProfile === GOAL_PROFILES.weight_loss;
  const items = [];

  for (const role of def.roles) {
    let pick = null;
    if (role === 'drink' || role === 'snack_drink') {
      pick = pickDrink(ranked, def.drinkPool || def.snackDrinkPool || ['water'], used);
    } else if (role === 'protein' && isStrength) {
      // strength gets two protein sources at lunch/dinner — handled by adding extra below
      pick = pickFromPool(ranked, ROLE_PREDICATES.protein, used, def.time);
    } else if (ROLE_PREDICATES[role]) {
      pick = pickFromPool(ranked, ROLE_PREDICATES[role], used, def.time);
    }
    if (pick) { items.push(pick); used.add(pick.id); }
  }

  // Goal-specific extras
  if (def.kind === 'main' && isStrength && def.time !== 'morning') {
    const extra = pickFromPool(ranked, f => ROLE_PREDICATES.protein(f) && !items.some(i => i.id === f.id), used, def.time);
    if (extra) { items.push(extra); used.add(extra.id); }
  }
  if (def.kind === 'main' && isWeightLoss && def.time !== 'evening') {
    // ensure a high-fiber plant for satiety
    const fiberPlant = pickFromPool(ranked, f => (PLANT_CATS.has(f.category) || FRUIT_CATS.has(f.category)) && f.fiber >= 3 && !items.some(i => i.id === f.id), used, def.time);
    if (fiberPlant) { items.push(fiberPlant); used.add(fiberPlant.id); }
  }

  return uniqueItems(items).slice(0, def.kind === 'snack' ? 2 : 5);
}

export function generateDailyPlan(profile, interests = []) {
  return generateDailyPlanCore(profile, interests, 0);
}

function generateDailyPlanCore(profile, interests, daySeed) {
  const targets = calculatePlanTargets(profile, interests);
  const mealsPerDay = Math.min(5, Math.max(2, Number(profile.mealsPerDay) || 3));
  const goal = profile.goal || 'weight_loss';
  const goalProfile = GOAL_PROFILES[goal] || GOAL_PROFILES.weight_loss;
  let ranked = scoreFoods(goal, interests);
  // rotate for the seed so the weekly plan varies per day
  if (daySeed > 0) {
    const k = daySeed % ranked.length;
    ranked = ranked.slice(k).concat(ranked.slice(0, k));
  }
  const used = new Set();
  const slotNames = mealSchedule(mealsPerDay);
  const meals = slotNames.map((slotName, index) => {
    const def = SLOT_DEFS[slotName];
    const items = buildSlot(slotName, ranked, used, goalProfile);
    const mealCalories = Math.round(targets.calories * shareFor(slotName, mealsPerDay));
    return {
      id: `meal_${daySeed}_${index}`,
      name: slotName,
      kind: def.kind,
      time: def.time,
      calories: mealCalories,
      protein: Math.round(items.reduce((s, it) => s + it.protein, 0)),
      fiber: Math.round(items.reduce((s, it) => s + it.fiber, 0)),
      items,
      why: buildMealWhy(goal, items, slotName),
    };
  });
  return { targets, rankedFoods: ranked, meals };
}

export function generateWeeklyPlan(profile, interests = []) {
  const days = [];
  for (let d = 0; d < 7; d++) {
    const day = generateDailyPlanCore(profile, interests, d);
    days.push({ dayIndex: d, dayLabel: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][d], ...day });
  }
  return days;
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

function buildMealWhy(goal, items, slotName) {
  if (!items || items.length === 0) return '';
  const names = items.map(i => i.name).join(', ');
  const goalText = {
    weight_loss: 'high-satiety protein, fiber, and low-energy-density choices',
    mood: 'steady energy, magnesium/omega-rich foods, and hydration',
    skin: 'antioxidants, vitamin-rich plants, hydration, and skin-supportive fats',
    hair: 'protein, B vitamins, zinc/iron-supportive foods, and healthy fats',
    strength: 'protein distribution, minerals, and training-friendly carbohydrates',
    healthy_aging: 'colorful plants, unsaturated fats, fiber, and micronutrient density',
  }[goal] || 'balanced nutrition';
  const slotText = slotName ? `${slotName.toLowerCase()}: ` : '';
  return `${slotText}${names} — paired for ${goalText}.`;
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
