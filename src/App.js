import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FoodCard from './components/FoodCard';
import MetricPill from './components/MetricPill';
import { FOODS, GOALS, SOURCES } from './data/foods';
import * as SecureStore from 'expo-secure-store';
import { initNotifications, scheduleMealReminders, scheduleCoachReminders, scheduleCheckInNudge, cancelCheckInNudgeForToday, scheduleMorningCoachReminder, cancelMorningCoachReminder, cancelCoachReminders } from './engine/notifications';
import { estimateHydrationLiters, generateDailyPlan, generateWeeklyPlan, buildGroceryList, searchFoods } from './engine/nutritionEngine';
import { buildSkrPaymentIntent, submitSkrPaymentIntent, SKR_TREASURY_WALLET } from './engine/skrPayments';
import * as WalletAdapter from '../WalletAdapter';

const W = Dimensions.get('window').width;

const C = { bg: '#0F1A12', card: '#162118', accent: '#34D399', gold: '#FBBF24', coral: '#FB7185', blue: '#60A5FA', purple: '#A78BFA', text: '#F1F5F0', dim: 'rgba(241,245,240,0.5)', faint: 'rgba(241,245,240,0.25)' };
const LEGAL_VERSION = '2026-05-10';
const LEGAL_URLS = {
  privacy: 'https://veronikusik.github.io/dietplanner/privacy.html',
  terms: 'https://veronikusik.github.io/dietplanner/terms.html',
  copyright: 'https://veronikusik.github.io/dietplanner/copyright.html',
};

const SKR_FEATURES = [
  { id: 'dietplanner_pro_monthly', title: 'AI Chef Pro', price: '100 SKR / mo', emoji: '📅', detail: '30-day rotating meal calendars and adaptive grocery lists.', type: 'Monthly plan', unlocks: ['30-day meal calendar', 'Smart grocery lists', 'Meal prep schedule', 'Saved favorite plans'] },
  { id: 'dietplanner_food_report', title: 'Deep Food Intel', price: '50 SKR', emoji: '📋', detail: 'Full food-vs-goal report with vitamins, obesity & aging impact.', type: 'One-time report', unlocks: ['Goal fit analysis', 'Vitamin/mineral strengths', 'Health cautions', 'Better substitutions'] },
  { id: 'dietplanner_daily_coach', title: 'Micro-Coach', price: '10 SKR / day', emoji: '💪', detail: 'Daily on-chain check-in, streak badge, and wallet-linked progress.', type: 'Daily pass', unlocks: ['Daily check-in', 'Nutrition streak', 'Habit nudges', 'Wallet accountability'] },
];

/* ── reusable ──────────────────────────────────────────────────────── */

function Chip({ label, active, onPress, accent = C.accent }) {
  return (
    <Pressable onPress={onPress} style={[$.chip, active && { backgroundColor: `${accent}30`, borderColor: accent }]}>
      <Text style={[$.chipT, active && { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

function Row({ children, gap = 8 }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

function GlassCard({ children, style, colors }) {
  return (
    <LinearGradient colors={colors || [C.card, '#1A2B1E']} style={[$.glass, style]}>
      {children}
    </LinearGradient>
  );
}

function Label({ children }) {
  return <Text style={$.label}>{children}</Text>;
}

function PremiumIcon({ size = 26, active = false, compact = false }) {
  return (
    <View style={[$.premiumIcon, compact && $.premiumIconCompact]}>
      <Text style={{ fontSize: size }}>💎</Text>
    </View>
  );
}

/* ── food detail modal ─────────────────────────────────────────────── */

function goalFitLabel(food, goal) {
  const goalTags = {
    weight_loss: ['weight_loss', 'satiety', 'gut'],
    mood: ['mood', 'omega3', 'gut'],
    skin: ['skin', 'antioxidant', 'healthy_aging'],
    hair: ['hair', 'strength'],
    strength: ['strength', 'protein'],
    healthy_aging: ['healthy_aging', 'heart', 'antioxidant'],
  }[goal] || [];
  const hits = food.tags.filter(t => goalTags.includes(t));
  if (hits.length >= 2) return { text: 'Excellent fit', color: C.accent };
  if (hits.length === 1) return { text: 'Good fit', color: C.gold };
  return { text: 'Neutral fit', color: C.dim };
}

function findSubstitutions(food) {
  return FOODS.filter(f => f.id !== food.id && f.category === food.category)
    .sort((a, b) => b.densityScore - a.densityScore)
    .slice(0, 3);
}

function FoodDetailModal({ food, visible, onClose, hasFoodIntel, userGoal }) {
  if (!food) return null;
  const fit = goalFitLabel(food, userGoal);
  const subs = hasFoodIntel ? findSubstitutions(food) : [];
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={$.mBg}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <LinearGradient colors={['#1A2B1E', '#162118', '#0F1A12']} style={$.mSheet}>
          <View style={$.mHandle} />
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: W * 1.5 }}>
            <Text style={$.mEmoji}>{food.emoji}</Text>
            <Text style={$.mTitle}>{food.name}</Text>
            <Text style={$.mCat}>{food.category}{food.region ? ` · ${food.region}` : ''}</Text>

            {hasFoodIntel && (
              <>
                <Label>GOAL FIT — {(userGoal || '').replace('_', ' ').toUpperCase()}</Label>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: fit.color }} />
                  <Text style={{ color: fit.color, fontSize: 14, fontWeight: '900' }}>{fit.text}</Text>
                </View>
                <Text style={$.mBody}>
                  {fit.text === 'Excellent fit'
                    ? `${food.name} directly supports your ${(userGoal || '').replace('_', ' ')} goal with multiple matching nutrients.`
                    : fit.text === 'Good fit'
                    ? `${food.name} partially supports your goal. Combine with complementary foods for best results.`
                    : `${food.name} is nutritious but doesn't specifically target your current goal.`}
                </Text>
              </>
            )}

            <Label>NUTRITION PER 100 G</Label>
            <Row gap={6}>
              <MetricPill label="Calories" value={`${food.calories}`} />
              <MetricPill label="Protein" value={`${food.protein}g`} tone={C.blue} />
              <MetricPill label="Carbs" value={`${food.carbs}g`} tone={C.accent} />
              <MetricPill label="Fat" value={`${food.fat}g`} tone={C.gold} />
              <MetricPill label="Fiber" value={`${food.fiber}g`} tone={C.coral} />
            </Row>

            {food.vitamins.length > 0 && <><Label>VITAMINS</Label>
              <Row>{food.vitamins.map(v => <View key={v} style={$.tag}><Text style={$.tagT}>{v}</Text></View>)}</Row></>}

            {food.minerals.length > 0 && <><Label>MINERALS</Label>
              <Row>{food.minerals.map(m => <View key={m} style={[$.tag, { borderColor: `${C.blue}44` }]}><Text style={[$.tagT, { color: C.blue }]}>{m}</Text></View>)}</Row></>}

            <Label>HEALTH IMPACT</Label>
            <Text style={$.mBody}>{food.impact}</Text>

            <Label>GOOD FOR</Label>
            <Row>{food.tags.map(t => <View key={t} style={[$.tag, { borderColor: `${C.accent}44` }]}><Text style={[$.tagT, { color: C.accent }]}>{t.replace('_', ' ')}</Text></View>)}</Row>

            <Label>WATCH OUT</Label>
            <Text style={$.mBody}>{food.caution}</Text>

            <Label>NUTRIENT DENSITY</Label>
            <View style={$.scoreBar}>
              <LinearGradient colors={[C.accent, C.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[$.scoreFill, { width: `${food.densityScore}%` }]} />
              <Text style={$.scoreNum}>{food.densityScore}/100</Text>
            </View>

            {hasFoodIntel && subs.length > 0 && (
              <>
                <Label>BETTER SUBSTITUTIONS</Label>
                <Text style={[$.secS, { marginBottom: 8 }]}>Higher-density alternatives in the same category.</Text>
                {subs.map(s => (
                  <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, padding: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12 }}>
                    <Text style={{ fontSize: 20 }}>{s.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontSize: 13, fontWeight: '800' }}>{s.name}</Text>
                      <Text style={{ color: C.dim, fontSize: 11 }}>{s.calories} kcal · {s.protein}g protein · density {s.densityScore}/100</Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            {!hasFoodIntel && (
              <>
                <Label>DEEP FOOD INTEL</Label>
                <Text style={[$.secS, { marginBottom: 4 }]}>🔒 Unlock goal-fit analysis, vitamin reports, and substitution recommendations with Deep Food Intel (50 SKR).</Text>
              </>
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={$.mClose}><Text style={$.mCloseT}>Close</Text></Pressable>
        </LinearGradient>
      </View>
    </Modal>
  );
}

/* ── main app ──────────────────────────────────────────────────────── */

export default function App() {
  const [tab, setTab] = useState('plan');
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMsg, setWalletMsg] = useState('');
  const [profile, setProfile] = useState({ sex: 'male', age: '32', heightCm: '178', weightKg: '82', activity: 'light', goal: 'weight_loss', mealsPerDay: '3' });
  const [interests, setInterests] = useState(['skin', 'mood']);
  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [toast, setToast] = useState(null);
  const [entitlements, setEntitlements] = useState({});
  const [purchaseIntents, setPurchaseIntents] = useState({});
  const [weekDay, setWeekDay] = useState(0);
  const [coachCheckedIn, setCoachCheckedIn] = useState(false);
  const [coachStreak, setCoachStreak] = useState(0);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(null);
  const [expandedFeature, setExpandedFeature] = useState('dietplanner_pro_monthly');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const entitlementsLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync('ds_entitlements');
        if (raw) setEntitlements(JSON.parse(raw));
        const streakRaw = await SecureStore.getItemAsync('ds_coach_streak');
        if (streakRaw) {
          const s = JSON.parse(streakRaw);
          setCoachStreak(s.streak || 0);
          const today = new Date().toDateString();
          if (s.lastDate === today) setCoachCheckedIn(true);
        }
        const disc = await SecureStore.getItemAsync('ds_legal_v1_ok');
        setDisclaimerAccepted(disc === LEGAL_VERSION);
      } catch (_) {}
      entitlementsLoaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!entitlementsLoaded.current) return;
    SecureStore.setItemAsync('ds_entitlements', JSON.stringify(entitlements)).catch(() => {});
  }, [entitlements]);

  useEffect(() => {
    initNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    scheduleMealReminders(Number(profile.mealsPerDay) || 3).catch(() => {});
  }, [profile.mealsPerDay]);

  useEffect(() => {
    const coach = entitlements.dietplanner_daily_coach;
    if (coach?.expiresAt) {
      scheduleCoachReminders(coach.expiresAt).catch(() => {});
      scheduleMorningCoachReminder().catch(() => {});
      if (!coachCheckedIn) scheduleCheckInNudge().catch(() => {});
    } else {
      cancelCoachReminders().catch(() => {});
      cancelMorningCoachReminder().catch(() => {});
    }
  }, [entitlements, coachCheckedIn]);

  const showToast = useCallback((msg, tone = 'info') => {
    setToast({ msg, tone });
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(tone === 'error' ? 3500 : 2500),
      Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [toastAnim]);

  const plan = useMemo(() => generateDailyPlan(profile, interests), [profile, interests]);
  const weeklyPlan = useMemo(() => generateWeeklyPlan(profile, interests), [profile, interests]);
  const groceryList = useMemo(() => buildGroceryList(weeklyPlan), [weeklyPlan]);
  const hydration = estimateHydrationLiters(profile.weightKg, profile.activity);
  const hasPro = !!entitlements.dietplanner_pro_monthly;
  const hasCoach = !!entitlements.dietplanner_daily_coach;
  const hasFoodIntel = !!entitlements.dietplanner_food_report;

  const doCoachCheckIn = useCallback(async () => {
    const today = new Date().toDateString();
    const newStreak = coachStreak + 1;
    setCoachCheckedIn(true);
    setCoachStreak(newStreak);
    await SecureStore.setItemAsync('ds_coach_streak', JSON.stringify({ streak: newStreak, lastDate: today })).catch(() => {});
    cancelCheckInNudgeForToday().catch(() => {});
    showToast(`Day ${newStreak} check-in done! Keep it up.`, 'ok');
  }, [coachStreak, showToast]);
  const fullFoodAccess = hasFoodIntel || hasPro;
  const availableFoods = useMemo(() => fullFoodAccess ? FOODS : FOODS.filter(food => !food.premium), [fullFoodAccess]);
  const lockedFoodsCount = FOODS.length - availableFoods.length;
  const foods = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableFoods;
    return availableFoods.filter(food => {
      const hay = [food.name, food.category, food.region || '', ...(food.tags || []), ...(food.vitamins || []), ...(food.minerals || [])].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [availableFoods, query]);

  useEffect(() => { WalletAdapter.initializeWalletAdapter().catch(() => {}); }, []);

  const connectWallet = useCallback(async () => {
    if (!disclaimerAccepted) {
      setDisclaimerAccepted(false);
      showToast('Please accept the Terms, Privacy Policy, and health disclaimer before connecting a wallet.', 'error');
      return { success: false, error: 'Legal acceptance required' };
    }
    if (walletLoading) return { success: false, error: 'Already connecting' };
    setWalletLoading(true);
    setWalletMsg('Looking for wallet…');
    try {
      await WalletAdapter.initializeWalletAdapter();
      const result = await WalletAdapter.connectBestWallet();
      if (result.success) {
        setWallet(result.address);
        setWalletMsg('');
        showToast(`Connected: ${result.address.slice(0, 4)}…${result.address.slice(-4)}`, 'ok');
        setWalletLoading(false);
        return result;
      } else {
        const err = result.error || '';
        let msg;
        if (err.includes('No wallet available') || err.includes('not available')) {
          msg = 'No Solana wallet found. Use a dev build for Seeker built-in wallet, or install Phantom.';
        } else if (err.includes('User cancelled')) {
          msg = 'Connection cancelled.';
        } else {
          msg = err || 'Wallet connection failed.';
        }
        setWalletMsg(msg);
        showToast(msg, 'error');
        setTab('premium');
        setWalletLoading(false);
        return result;
      }
    } catch (e) {
      const msg = e.message || 'Connection failed.';
      setWalletMsg(msg);
      showToast(msg, 'error');
      setTab('premium');
      setWalletLoading(false);
      return { success: false, error: msg };
    }
  }, [walletLoading, disclaimerAccepted, showToast]);

  const up = (k, v) => setProfile(p => ({ ...p, [k]: v }));
  const tog = (v) => setInterests(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);

  const buySkr = async (f) => {
    if (!disclaimerAccepted) {
      setDisclaimerAccepted(false);
      showToast('Please accept the Terms, Privacy Policy, and payment disclosures before purchasing.', 'error');
      return;
    }
    if (entitlements[f.id]) { showToast(`${f.title} is already active.`, 'ok'); return; }
    let walletAddr = wallet;
    if (!walletAddr) {
      const res = await connectWallet();
      if (!res || !res.success) return;
      walletAddr = res.address;
    }
    try {
      const intent = buildSkrPaymentIntent({ productId: f.id, walletAddress: walletAddr });
      const res = await submitSkrPaymentIntent(intent, { transact: WalletAdapter.executeTransaction });
      if (res.success) {
        const expiresAt = f.id === 'dietplanner_pro_monthly' ? Date.now() + 30 * 86400000 : f.id === 'dietplanner_daily_coach' ? Date.now() + 86400000 : null;
        setEntitlements(p => ({ ...p, [f.id]: { productId: f.id, title: f.title, activatedAt: Date.now(), expiresAt, tx: res.signature || null } }));
        showToast(`${f.title} activated.`, 'ok');
      } else if (res.missingMint) {
        setPurchaseIntents(p => ({ ...p, [f.id]: { ...intent, createdAt: Date.now(), nextStep: res.nextStep } }));
        showToast('SKR mint address is required before real payments can run.', 'error');
      } else if (res.pendingImplementation) {
        setPurchaseIntents(p => ({ ...p, [f.id]: { ...intent, createdAt: Date.now(), nextStep: res.nextStep } }));
        showToast('Payment transfer is not wired yet. Intent saved as pending.', 'error');
      } else {
        showToast(res.error || 'Purchase could not be completed.', 'error');
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('Cancel') || msg.includes('cancel') || msg.includes('rejected') || msg.includes('Rejected')) {
        showToast('Payment cancelled.', 'error');
      } else {
        showToast(msg || 'Payment error', 'error');
      }
    }
  };

  return (
    <SafeAreaView style={$.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <LinearGradient colors={[C.bg, '#0A1410', C.bg]} style={$.root}>

        {/* ── header ── */}
        <View style={$.hdr}>
          <View style={{ flex: 1 }}>
            <Text style={$.hdrLogo}><Text style={{ color: C.accent }}>Diet</Text><Text style={{ color: C.gold }}>Seeker</Text></Text>
            <Text style={$.hdrSub}>🌿 smart nutrition engine</Text>
          </View>
          <Pressable onPress={() => wallet ? setTab('premium') : connectWallet()} style={[$.walletBtn, wallet && $.walletBtnOk]}>
            <Text style={{ fontSize: 16 }}>{wallet ? '✅' : '🔗'}</Text>
            <Text style={[$.walletBtnT, wallet && { color: '#0F1A12' }]}>{wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : 'Connect'}</Text>
          </Pressable>
        </View>

        {/* ── content ── */}
        <ScrollView contentContainerStyle={$.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ═══ MY PLAN ═══ */}
          {tab === 'plan' && (<View>

            {/* hero banner */}
            <LinearGradient colors={['#1B3A26', '#162B1E', C.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={$.hero}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 40, marginBottom: 8 }}>🥗</Text>
                <Pressable onPress={() => setTab('premium')} style={[$.heroPlanPill, Object.keys(entitlements).length ? { backgroundColor: `${C.accent}25`, borderColor: `${C.accent}66` } : { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }]}>
                  <Text style={{ fontSize: 12 }}>{Object.keys(entitlements).length ? '✓' : '🔒'}</Text>
                  <Text style={[$.heroPlanT, { color: Object.keys(entitlements).length ? C.accent : C.dim }]}>
                    {Object.keys(entitlements).length ? `${Object.keys(entitlements).length} Premium` : 'Free'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 3, marginLeft: 4 }}>
                    {SKR_FEATURES.map(f => (
                      <View key={f.id} style={[$.statusDot, { width: 6, height: 6, borderRadius: 3 }, entitlements[f.id] ? { backgroundColor: C.accent } : purchaseIntents[f.id] ? { backgroundColor: C.gold } : { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                    ))}
                  </View>
                </Pressable>
              </View>
              <Text style={$.heroT}>Your personalized{'\n'}nutrition plan</Text>
              <Text style={$.heroS}>Meals crafted for your body, goals, and interests. Data from USDA.</Text>
              <View style={$.heroMetrics}>
                <View style={$.heroM}><Text style={$.heroMV}>{plan.targets.calories}</Text><Text style={$.heroML}>kcal</Text></View>
                <View style={[$.heroM, { borderColor: `${C.blue}44` }]}><Text style={[$.heroMV, { color: C.blue }]}>{plan.targets.protein}g</Text><Text style={$.heroML}>protein</Text></View>
                <View style={[$.heroM, { borderColor: `${C.gold}44` }]}><Text style={[$.heroMV, { color: C.gold }]}>{plan.targets.fiber}g</Text><Text style={$.heroML}>fiber</Text></View>
              </View>
            </LinearGradient>

            {/* profile — body */}
            <GlassCard style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 20 }}>👤</Text>
                <Text style={$.secT}>Body</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['male', 'female'].map(v => <Chip key={v} label={v} active={profile.sex === v} onPress={() => up('sex', v)} />)}
              </View>
              <View style={$.profileGrid}>
                {[['age', 'Age', 'yr'], ['heightCm', 'Height', 'cm'], ['weightKg', 'Weight', 'kg']].map(([k, label, unit]) => (
                  <View key={k} style={$.profileField}>
                    <View style={$.pfCompact}>
                      <TextInput style={$.pfInput} value={profile[k]} onChangeText={v => up(k, v)} keyboardType="number-pad" placeholder="—" placeholderTextColor={C.faint} />
                      <Text style={$.pfUnit}>{unit}</Text>
                    </View>
                    <Text style={$.pfLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            {/* profile — plan settings */}
            <GlassCard style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 20 }}>🎯</Text>
                <Text style={$.secT}>Goal & Meals</Text>
              </View>
              <Row>{GOALS.map(g => <Chip key={g.id} label={g.label} active={profile.goal === g.id} accent={g.accent} onPress={() => up('goal', g.id)} />)}</Row>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <Text style={{ color: C.dim, fontSize: 12, fontWeight: '800', width: 56 }}>Meals</Text>
                <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
                  {['2', '3', '4', '5'].map(v => (
                    <Pressable key={v} onPress={() => up('mealsPerDay', v)} style={[$.numChip, profile.mealsPerDay === v && $.numChipOn]}>
                      <Text style={[$.numChipT, profile.mealsPerDay === v && { color: C.bg }]}>{v}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Text style={{ color: C.dim, fontSize: 12, fontWeight: '800', width: 56 }}>Activity</Text>
                <View style={{ flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                  {['low', 'light', 'moderate', 'high'].map(v => (
                    <Pressable key={v} onPress={() => up('activity', v)} style={[$.actChip, profile.activity === v && $.numChipOn]}>
                      <Text style={[$.numChipT, profile.activity === v && { color: C.bg }]} numberOfLines={1}>{v}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </GlassCard>

            {/* profile — interests */}
            <GlassCard style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Text style={{ fontSize: 20 }}>✨</Text>
                <Text style={$.secT}>Interests</Text>
              </View>
              <Row>{['skin', 'hair', 'mood', 'gut', 'omega3', 'antioxidant', 'heart', 'satiety'].map(t => <Chip key={t} label={t} active={interests.includes(t)} onPress={() => tog(t)} />)}</Row>
            </GlassCard>

            {/* daily targets */}
            <GlassCard style={{ marginTop: 14 }} colors={['#1A2420', '#162118']}>
              <Text style={$.secT}>📊  Daily Targets</Text>
              <Text style={$.secS}>Mifflin-St Jeor estimate. Not medical advice.</Text>
              <View style={{ height: 8 }} />
              <Row gap={6}>
                <MetricPill label="Calories" value={`${plan.targets.calories}`} />
                <MetricPill label="Protein" value={`${plan.targets.protein}g`} tone={C.blue} />
                <MetricPill label="Carbs" value={`${plan.targets.carbs}g`} tone={C.accent} />
                <MetricPill label="Fat" value={`${plan.targets.fat}g`} tone={C.gold} />
                <MetricPill label="Fiber" value={`${plan.targets.fiber}g`} tone={C.coral} />
                <MetricPill label="BMR" value={`${plan.targets.bmr}`} tone={C.purple} />
                <MetricPill label="TDEE" value={`${plan.targets.tdee}`} tone={C.coral} />
                <MetricPill label="Water" value={`${hydration}L`} tone={C.blue} />
              </Row>
            </GlassCard>

            {/* meals */}
            <Text style={[$.secT, { marginTop: 20 }]}>🍽️  Your Meals</Text>
            <Text style={$.secS}>{plan.meals.length} meals — scored by goal, protein, fiber & nutrients</Text>
            {hasPro && (
              <GlassCard style={{ marginTop: 10, marginBottom: 4 }} colors={['#2B2415', '#1A2418']}>
                <Text style={$.mealN}>📅 AI Chef Pro — Weekly Calendar</Text>
                <Text style={$.secS}>Swipe through your 7-day rotation. Grocery list below.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                  {weeklyPlan.map((d, i) => (
                    <Pressable key={i} onPress={() => setWeekDay(i)} style={[$.dayChip, weekDay === i && $.dayChipOn]}>
                      <Text style={[$.dayChipT, weekDay === i && { color: C.bg }]}>{d.dayLabel.slice(0, 3)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Text style={[$.secS, { marginTop: 8, fontWeight: '900', color: C.gold }]}>{weeklyPlan[weekDay]?.dayLabel}</Text>
                {weeklyPlan[weekDay]?.meals.map(meal => (
                  <View key={meal.id} style={{ marginTop: 6, padding: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '800' }}>{meal.name}</Text>
                      <Text style={{ color: C.accent, fontSize: 12, fontWeight: '800' }}>{meal.calories} kcal</Text>
                    </View>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>{meal.items.map(it => `${it.emoji} ${it.name}`).join('  ·  ')}</Text>
                  </View>
                ))}
                <Text style={[$.mealN, { marginTop: 14 }]}>🛒 Grocery List ({groceryList.length} items)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {groceryList.map(g => (
                    <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                      <Text style={{ fontSize: 16 }}>{g.emoji}</Text>
                      <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>{g.name}</Text>
                      {g.count > 1 && <Text style={{ color: C.gold, fontSize: 10, fontWeight: '900' }}>×{g.count}</Text>}
                    </View>
                  ))}
                </View>
              </GlassCard>
            )}
            {hasCoach && (
              <GlassCard style={{ marginTop: 10, marginBottom: 4 }} colors={['#1C2430', '#18202A']}>
                <Text style={$.mealN}>💪 Micro-Coach — Daily Check-in</Text>
                <Text style={$.secS}>Stay consistent and build your nutrition streak.</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: C.gold, fontSize: 28, fontWeight: '900' }}>{coachStreak}</Text>
                    <Text style={{ color: C.dim, fontSize: 10, fontWeight: '800' }}>day streak</Text>
                  </View>
                  {!coachCheckedIn ? (
                    <Pressable onPress={doCoachCheckIn} style={[$.btnMain, { flex: 1, marginTop: 0 }]}>
                      <Text style={$.btnMainT}>✅ Check In Today</Text>
                    </Pressable>
                  ) : (
                    <View style={[$.btnMain, { flex: 1, marginTop: 0, backgroundColor: `${C.accent}22` }]}>
                      <Text style={[$.btnMainT, { color: C.accent }]}>Checked in today ✓</Text>
                    </View>
                  )}
                </View>
                <Text style={[$.secS, { marginTop: 8 }]}>Tip: hit your protein target today and drink {hydration}L of water.</Text>
              </GlassCard>
            )}
            <View style={{ height: 10 }} />
            {plan.meals.map(meal => (
              <GlassCard key={meal.id} style={{ marginBottom: 12 }} colors={['#1C3024', '#172218']}>
                <View style={$.mealHdr}><Text style={$.mealN}>{meal.name}</Text><View style={$.kcalBadge}><Text style={$.kcalT}>{meal.calories} kcal</Text></View></View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {meal.items.map((it, i) => (
                    <Pressable key={it.id + i} onPress={() => setSelectedFood(it)} style={$.foodChip}>
                      <Text style={{ fontSize: 20 }}>{it.emoji}</Text>
                      <Text style={$.foodChipT}>{it.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={$.mealWhy}>{meal.why}</Text>
                <Row gap={6}>
                  <View style={$.stat}><Text style={$.statT}>{meal.protein}g protein</Text></View>
                  <View style={[$.stat, { backgroundColor: `${C.coral}18` }]}><Text style={[$.statT, { color: C.coral }]}>{meal.fiber}g fiber</Text></View>
                </Row>
              </GlassCard>
            ))}
          </View>)}

          {/* ═══ FOODS ═══ */}
          {tab === 'foods' && (<View>
            <Text style={{ fontSize: 40, marginBottom: 4 }}>🍎</Text>
            <Text style={$.secT}>Food & Drink Encyclopedia</Text>
            <Text style={$.secS}>{fullFoodAccess ? `Global database unlocked: ${FOODS.length} foods across continents with Deep Food Intel.` : `Free starter catalog: ${availableFoods.length} foods. Premium unlocks ${lockedFoodsCount} more foods from global cuisines and advanced reports.`}</Text>
            <TextInput style={$.search} value={query} onChangeText={setQuery} placeholder="Search salmon, dal, injera, iron, Africa…" placeholderTextColor={C.faint} />
            <GlassCard style={{ marginTop: 8, marginBottom: 10 }} colors={fullFoodAccess ? ['#1A3028', '#162820'] : ['#2B2415', '#1A2418']}>
              <Text style={$.mealN}>{fullFoodAccess ? '✅ Full Food Database Active' : '🔒 Premium Food Database'}</Text>
              <Text style={$.secS}>{fullFoodAccess ? 'Global foods, regions, vitamins, minerals, goal tags, cautions, and report-ready insights are available.' : `Unlock ${lockedFoodsCount} more foods across Africa, Asia, Europe, Latin America, the Middle East, the Pacific, seafood, staples, fruits, vegetables, fermented foods, and performance foods.`}</Text>
              {!fullFoodAccess && <Pressable onPress={() => setTab('premium')} style={$.miniBtn}><Text style={$.miniBtnT}>View Premium</Text></Pressable>}
            </GlassCard>
            <Text style={$.resultN}>{foods.length} shown · {availableFoods.length}/{FOODS.length} foods unlocked</Text>
            <View style={$.foodGrid}>{foods.map(food => <FoodCard key={food.id} food={food} onPress={() => setSelectedFood(food)} />)}</View>
          </View>)}

          {/* ═══ PREMIUM ═══ */}
          {tab === 'premium' && (<View>
            <Text style={$.secT}>Premium Plans</Text>
            <Text style={$.secS}>Unlock advanced nutrition tools powered by SKR on Solana.</Text>

            <View style={[$.statusBar, Object.keys(entitlements).length ? { borderColor: `${C.accent}55`, backgroundColor: `${C.accent}12` } : { borderColor: `${C.gold}33`, backgroundColor: `${C.gold}10` }]}>
              <Text style={[$.statusBarT, { color: Object.keys(entitlements).length ? C.accent : C.gold }]}>
                {Object.keys(entitlements).length ? `✅ ${Object.keys(entitlements).length} Premium Active` : '🔒 Free Plan'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {SKR_FEATURES.map(f => (
                  <View key={f.id} style={[$.statusDot, entitlements[f.id] ? { backgroundColor: C.accent } : purchaseIntents[f.id] ? { backgroundColor: C.gold } : { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                ))}
              </View>
            </View>

            <Text style={[$.secT, { marginTop: 20 }]}>💎  Premium SKR Features</Text>
            <Text style={$.secS}>Purchases send SKR to the DietPlanner treasury. Your wallet pays SOL network fees in real time.</Text>
            <View style={{ height: 10 }} />
            {SKR_FEATURES.map(f => {
              const expanded = expandedFeature === f.id;
              return (
                <Pressable key={f.id} onPress={() => setExpandedFeature(expanded ? null : f.id)}>
                  <GlassCard style={{ marginBottom: 8 }} colors={['#1C2430', '#18202A']}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 24, marginRight: 10 }}>{f.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[$.mealN, { fontSize: 15 }]}>{f.title}</Text>
                        <Text style={[$.typeT, { fontSize: 11 }]}>{f.type}</Text>
                      </View>
                      <View style={[$.priceBadge, entitlements[f.id] && $.activeBadge, purchaseIntents[f.id] && $.pendingBadge, { marginRight: 6 }]}>
                        <Text style={[$.priceT, entitlements[f.id] && $.activeBadgeT]}>{entitlements[f.id] ? 'ACTIVE' : purchaseIntents[f.id] ? 'PENDING' : f.price}</Text>
                      </View>
                      <Text style={{ color: C.dim, fontSize: 16 }}>{expanded ? '▾' : '▸'}</Text>
                    </View>

                    {expanded && (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={$.secS}>{f.detail}</Text>
                        <View style={{ marginTop: 8, gap: 4 }}>
                          {f.unlocks.map(item => <Text key={item} style={$.unlockT}>✓ {item}</Text>)}
                        </View>
                        <Pressable onPress={() => buySkr(f)} style={[$.btnMain, { marginTop: 12, paddingVertical: 12 }, entitlements[f.id] && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                          <Text style={[$.btnMainT, entitlements[f.id] && { color: C.dim }]}>
                            {entitlements[f.id] ? '✓ Unlocked' : purchaseIntents[f.id] ? 'Retry payment' : wallet ? `Buy ${f.price}` : 'Connect wallet to buy'}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </GlassCard>
                </Pressable>
              );
            })}
          </View>)}

          {/* ═══ ABOUT ═══ */}
          {tab === 'about' && (<View>
            <Text style={{ fontSize: 40, marginBottom: 4 }}>🌿</Text>
            <Text style={$.secT}>About DietPlanner</Text>
            <Text style={$.secS}>Version 1.0.0</Text>
            <GlassCard style={{ marginTop: 12 }}>
              <Text style={$.aboutP}>DietPlanner helps you explore nutrition, plan meals, and understand how food impacts your body and goals.</Text>
              <Text style={$.aboutP}>Uses the Mifflin-St Jeor equation for BMR, USDA FoodData Central for nutrition facts, and NIH / Dietary Guidelines for health context.</Text>
              <Text style={$.aboutP}>Premium features are powered by SKR tokens on the Solana blockchain.</Text>
            </GlassCard>

            <Text style={[$.secT, { marginTop: 20 }]}>🛡️  Data Sources</Text>
            <Text style={$.secS}>Traceable to public, peer-reviewed sources.</Text>
            <View style={{ height: 10 }} />
            {SOURCES.map(src => (
              <GlassCard key={src.name} style={{ marginBottom: 10 }}>
                <Text style={$.mealN}>{src.name}</Text>
                <Text style={[$.secS, { marginTop: 4 }]}>{src.note}</Text>
                <Text style={{ color: C.accent, fontSize: 11, marginTop: 6 }}>{src.url}</Text>
              </GlassCard>
            ))}

            <LinearGradient colors={['#1A2B1E', '#162118', '#0F1A12']} style={[$.glass, { marginTop: 10 }]}>
              <Text style={{ color: C.coral, fontWeight: '900', fontSize: 13, marginBottom: 6 }}>⚠️  Health Disclaimer</Text>
              <Text style={$.disclaimerP}>DietPlanner provides general nutritional information for educational purposes only. It is NOT intended as medical advice and does not diagnose, treat, cure, or prevent any disease.</Text>
              <Text style={$.disclaimerP}>Always consult a qualified healthcare provider or registered dietitian before changing your diet, especially if you have diabetes, kidney disease, eating disorders, food allergies, are pregnant or nursing, or take medication that interacts with food.</Text>
              <Text style={$.disclaimerP}>Meal plans and food recommendations are algorithmically generated based on peer-reviewed formulas and public nutrition databases. Individual results may vary significantly. DietPlanner makes no guarantees regarding health outcomes.</Text>
              <Text style={$.disclaimerP}>By using DietPlanner, you agree to our Terms of Service, Privacy Policy, and acknowledge the Health Disclaimer above.</Text>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)}><Text style={{ color: C.accent, fontSize: 11, marginTop: 4 }}>Privacy Policy: {LEGAL_URLS.privacy}</Text></Pressable>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)}><Text style={{ color: C.accent, fontSize: 11, marginTop: 2 }}>Terms of Service: {LEGAL_URLS.terms}</Text></Pressable>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.copyright)}><Text style={{ color: C.accent, fontSize: 11, marginTop: 2 }}>Copyright: {LEGAL_URLS.copyright}</Text></Pressable>
              <Text style={{ color: C.dim, fontSize: 11, lineHeight: 16 }}>© 2024-2026 DietPlanner. All rights reserved. Nutritional data sourced from USDA FoodData Central (public domain). Solana and SKR token integrations are provided as-is. DietPlanner is not affiliated with the USDA, NIH, WHO, or any government agency.</Text>
            </LinearGradient>

            <LinearGradient colors={['#1A1A2A', '#14141F']} style={[$.glass, { marginTop: 10 }]}>
              <Text style={{ color: C.blue, fontWeight: '900', fontSize: 13, marginBottom: 6 }}>ℹ️  Legal</Text>
              <Text style={$.disclaimerP}>By using DietPlanner, you agree to our Terms of Service, Privacy Policy, and acknowledge the Health Disclaimer above.</Text>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)}><Text style={{ color: C.accent, fontSize: 11, marginTop: 4 }}>Privacy Policy: {LEGAL_URLS.privacy}</Text></Pressable>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)}><Text style={{ color: C.accent, fontSize: 11, marginTop: 2 }}>Terms of Service: {LEGAL_URLS.terms}</Text></Pressable>
              <Pressable onPress={() => Linking.openURL(LEGAL_URLS.copyright)}><Text style={{ color: C.accent, fontSize: 11, marginTop: 2 }}>Copyright: {LEGAL_URLS.copyright}</Text></Pressable>
            </LinearGradient>

            <GlassCard style={{ marginTop: 10 }}>
              <Text style={{ color: C.dim, fontSize: 11, lineHeight: 16 }}> 2024-2026 DietPlanner. All rights reserved. Nutritional data sourced from USDA FoodData Central (public domain). Solana and SKR token integrations are provided as-is. DietPlanner is not affiliated with the USDA, NIH, WHO, or any government agency.</Text>
            </GlassCard>
          </View>)}

        </ScrollView>

        {/* ── tab bar ── */}
        <LinearGradient colors={['#0F1A12F0', '#0A1410FA']} style={$.bar}>
          {[['plan', '🥗', 'My Plan'], ['foods', '🍎', 'Foods'], ['premium', null, 'Premium'], ['about', 'ℹ️', 'About']].map(([id, em, lb]) => (
            <Pressable key={id} onPress={() => setTab(id)} style={[$.barItem, tab === id && $.barOn]}>
              {id === 'premium' ? <PremiumIcon size={21} active={tab === id} compact /> : <Text style={{ fontSize: 22 }}>{em}</Text>}
              <Text style={[$.barT, tab === id && $.barTOn]}>{lb}</Text>
            </Pressable>
          ))}
        </LinearGradient>

      </LinearGradient>

      <FoodDetailModal food={selectedFood} visible={!!selectedFood} onClose={() => setSelectedFood(null)} hasFoodIntel={hasFoodIntel || hasPro} userGoal={profile.goal} />

      {/* ── first-launch legal acceptance ── */}
      <Modal transparent animationType="fade" visible={disclaimerAccepted === false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' }}>
          <LinearGradient colors={['#1A2B1E', '#162118', '#0F1A12']} style={{ flex: 1, padding: 20 }}>
            <Text style={{ fontSize: 40, textAlign: 'center', marginTop: 8, marginBottom: 4 }}>⚕️</Text>
            <Text style={[$.mTitle, { textAlign: 'center', fontSize: 22 }]}>Terms, Privacy & Health Disclaimer</Text>
            <Text style={[$.mCat, { textAlign: 'center', marginBottom: 12 }]}>Please read before using DietPlanner, connecting a wallet, or buying premium features.</Text>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
              <Text style={$.disclaimerH}>Not Medical Advice</Text>
              <Text style={$.disclaimerP}>DietPlanner provides general nutritional information for educational purposes only. It is not intended to be, and should not be used as, a substitute for professional medical advice, diagnosis, or treatment.</Text>

              <Text style={$.disclaimerH}>Consult a Professional</Text>
              <Text style={$.disclaimerP}>Always consult a qualified healthcare provider or registered dietitian before making changes to your diet, especially if you have diabetes, kidney disease, eating disorders, food allergies, are pregnant or nursing, or take medication that interacts with food.</Text>

              <Text style={$.disclaimerH}>Data Sources</Text>
              <Text style={$.disclaimerP}>Nutritional data is derived from the USDA FoodData Central database, NIH Dietary Supplement Fact Sheets, and WHO/FAO Dietary Guidelines. Calorie targets use the Mifflin-St Jeor equation, a peer-reviewed BMR estimation method. Individual results may vary.</Text>

              <Text style={$.disclaimerH}>No Guarantees</Text>
              <Text style={$.disclaimerP}>DietPlanner does not guarantee any health outcomes. Meal plans and food recommendations are algorithmically generated and may not account for your specific medical conditions, intolerances, or nutritional needs.</Text>

              <Text style={$.disclaimerH}>Premium Features</Text>
              <Text style={$.disclaimerP}>Premium features are purchased using SKR tokens on the Solana blockchain. Your wallet pays the displayed SKR amount plus any SOL network fees. Blockchain transactions are public and generally irreversible. DietPlanner does not store or have access to your wallet private keys.</Text>

              <Text style={$.disclaimerH}>Legal Documents</Text>
              <Text style={$.disclaimerP}>By accepting, you confirm that you are at least 18 years old and agree to the Terms of Service, Privacy Policy, and health/payment disclosures.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.terms)} style={$.legalLink}><Text style={$.legalLinkT}>Terms</Text></Pressable>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.privacy)} style={$.legalLink}><Text style={$.legalLinkT}>Privacy</Text></Pressable>
                <Pressable onPress={() => Linking.openURL(LEGAL_URLS.copyright)} style={$.legalLink}><Text style={$.legalLinkT}>Copyright</Text></Pressable>
              </View>
            </ScrollView>

            <Pressable onPress={async () => { setDisclaimerAccepted(true); await SecureStore.setItemAsync('ds_legal_v1_ok', LEGAL_VERSION).catch(() => {}); }} style={[$.btnMain, { marginTop: 10, marginBottom: 4 }]}>
              <Text style={$.btnMainT}>I Agree & Confirm I Am 18+</Text>
            </Pressable>
          </LinearGradient>
        </SafeAreaView>
      </Modal>

      {toast && (
        <Animated.View style={[$.toast, toast.tone === 'ok' && $.toastOk, toast.tone === 'error' && $.toastErr, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] }]} pointerEvents="none">
          <Text style={{ fontSize: 16 }}>{toast.tone === 'ok' ? '✅' : '⚠️'}</Text>
          <Text style={$.toastT} numberOfLines={3}>{toast.msg}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

/* ── styles ─────────────────────────────────────────────────────────── */
const $ = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  root: { flex: 1, paddingTop: Platform.OS === 'android' ? 10 : 0 },

  hdr: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  hdrLogo: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  hdrSub: { color: C.dim, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 1 },
  walletBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: `${C.accent}66`, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  walletBtnOk: { backgroundColor: C.accent, borderColor: C.accent },
  walletBtnT: { color: C.accent, fontWeight: '800', fontSize: 12 },

  scroll: { paddingHorizontal: 18, paddingBottom: 105 },

  hero: { borderRadius: 28, padding: 22, borderWidth: 1, borderColor: `${C.accent}22` },
  heroT: { color: C.text, fontSize: 26, fontWeight: '900', lineHeight: 33, letterSpacing: -0.5 },
  heroS: { color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 16 },
  heroMetrics: { flexDirection: 'row', gap: 10 },
  heroM: { flex: 1, backgroundColor: `${C.accent}15`, borderWidth: 1, borderColor: `${C.accent}33`, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  heroMV: { color: C.accent, fontSize: 20, fontWeight: '900' },
  heroML: { color: C.dim, fontSize: 10, fontWeight: '700', marginTop: 2 },

  glass: { borderRadius: 22, padding: 16, borderWidth: 1, borderColor: 'rgba(52,211,153,0.12)' },
  secT: { color: C.text, fontSize: 20, fontWeight: '900' },
  secS: { color: C.dim, fontSize: 12, lineHeight: 17, marginTop: 2 },
  aboutP: { color: C.dim, fontSize: 13, lineHeight: 20, marginBottom: 10 },
  disclaimerH: { color: C.text, fontSize: 14, fontWeight: '900', marginTop: 12, marginBottom: 4 },
  disclaimerP: { color: C.dim, fontSize: 12, lineHeight: 19, marginBottom: 8 },
  legalLink: { borderWidth: 1, borderColor: `${C.accent}44`, backgroundColor: `${C.accent}14`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  legalLinkT: { color: C.accent, fontSize: 12, fontWeight: '900' },

  label: { color: C.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 16, marginBottom: 6 },

  premiumIcon: { alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  premiumIconCompact: { alignSelf: 'center', marginBottom: 0 },

  profileGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  profileField: { flex: 1, alignItems: 'center' },
  pfCompact: { flexDirection: 'row', alignItems: 'baseline', gap: 2, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pfInput: { color: C.text, fontSize: 22, fontWeight: '900', padding: 0, minWidth: 36, textAlign: 'center' },
  pfUnit: { color: C.faint, fontSize: 11, fontWeight: '800' },
  pfLabel: { color: C.dim, fontSize: 10, fontWeight: '800', marginTop: 4 },
  heroPlanPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  heroPlanT: { fontSize: 11, fontWeight: '900', letterSpacing: 0.3 },

  statusBar: { marginTop: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBarT: { fontSize: 13, fontWeight: '900' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  numChip: { flex: 1, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  actChip: { flex: 1, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, minWidth: 60 },
  numChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  numChipT: { color: C.dim, fontSize: 12, fontWeight: '900' },

  inp: { width: '47%', backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderRadius: 14, color: C.text, paddingHorizontal: 13, paddingVertical: 11, fontWeight: '800', fontSize: 14 },

  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 8 },
  chipT: { color: C.dim, fontSize: 13, fontWeight: '800' },

  mealHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealN: { color: C.text, fontSize: 17, fontWeight: '900' },
  kcalBadge: { backgroundColor: `${C.accent}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  kcalT: { color: C.accent, fontSize: 12, fontWeight: '900' },
  foodChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  foodChipT: { color: C.text, fontSize: 13, fontWeight: '700' },
  mealWhy: { color: C.dim, fontSize: 12, marginTop: 10, marginBottom: 10, lineHeight: 18 },
  stat: { backgroundColor: `${C.blue}18`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statT: { color: C.blue, fontSize: 11, fontWeight: '900' },

  search: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: `${C.accent}22`, borderWidth: 1.5, borderRadius: 18, color: C.text, paddingHorizontal: 16, paddingVertical: 13, marginTop: 10, marginBottom: 6, fontSize: 14 },
  resultN: { color: C.faint, fontSize: 11, marginBottom: 10, fontWeight: '700' },
  foodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  miniBtn: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: `${C.gold}22`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  miniBtnT: { color: C.gold, fontSize: 12, fontWeight: '900' },

  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', marginRight: 6 },
  dayChipOn: { backgroundColor: C.gold, borderColor: C.gold },
  dayChipT: { color: C.dim, fontSize: 12, fontWeight: '900' },

  btnMain: { backgroundColor: C.accent, borderRadius: 18, alignItems: 'center', paddingVertical: 15, marginTop: 16 },
  btnMainT: { color: '#0F1A12', fontWeight: '900', fontSize: 15 },
  btnOut: { borderWidth: 1.5, borderColor: `${C.coral}55`, borderRadius: 16, alignItems: 'center', paddingVertical: 12, marginTop: 16 },
  btnOutT: { color: C.coral, fontWeight: '800', fontSize: 13 },
  tipT: { color: C.faint, fontSize: 11, marginTop: 12, textAlign: 'center' },

  priceBadge: { backgroundColor: `${C.gold}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  priceT: { color: C.gold, fontSize: 11, fontWeight: '900' },
  activeBadge: { backgroundColor: `${C.accent}22` },
  activeBadgeT: { color: C.accent },
  pendingBadge: { backgroundColor: `${C.coral}18` },
  typeT: { color: C.gold, fontSize: 11, fontWeight: '900', marginTop: 2 },
  unlockT: { color: 'rgba(241,245,240,0.72)', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  ctaT: { color: C.faint, fontSize: 11, fontWeight: '800', marginTop: 10 },
  statusPill: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.04)' },
  statusPillOn: { borderColor: `${C.accent}44`, backgroundColor: `${C.accent}14` },
  statusPillPending: { borderColor: `${C.coral}44`, backgroundColor: `${C.coral}12` },
  statusPillT: { color: C.dim, fontSize: 10, fontWeight: '900' },
  statusPillTOn: { color: C.accent },

  aboutP: { color: 'rgba(241,245,240,0.7)', lineHeight: 21, fontSize: 14, marginBottom: 10 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Platform.OS === 'android' ? 10 : 28, paddingTop: 8, paddingHorizontal: 8, flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(52,211,153,0.1)' },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 6, borderRadius: 20 },
  barOn: { backgroundColor: `${C.accent}22` },
  barT: { color: C.faint, fontSize: 10, fontWeight: '800' },
  barTOn: { color: C.accent },

  toast: { position: 'absolute', top: Platform.OS === 'android' ? 42 : 54, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 18, backgroundColor: 'rgba(22,33,24,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  toastOk: { borderColor: `${C.accent}55` },
  toastErr: { borderColor: `${C.coral}55` },
  toastT: { color: C.text, fontSize: 13, fontWeight: '700', flex: 1, lineHeight: 18 },

  mBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  mSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 22, paddingBottom: 34, maxHeight: '88%' },
  mHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 16 },
  mEmoji: { fontSize: 56, textAlign: 'center' },
  mTitle: { color: C.text, fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  mCat: { color: C.dim, textAlign: 'center', fontSize: 13, marginBottom: 16 },
  mBody: { color: 'rgba(241,245,240,0.7)', fontSize: 13, lineHeight: 20 },
  tag: { borderWidth: 1, borderColor: `${C.gold}33`, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  tagT: { color: C.gold, fontSize: 12, fontWeight: '700' },
  scoreBar: { height: 24, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  scoreFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 12 },
  scoreNum: { color: C.text, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  mClose: { backgroundColor: `${C.accent}22`, borderRadius: 18, alignItems: 'center', paddingVertical: 14, marginTop: 16 },
  mCloseT: { color: C.accent, fontWeight: '900', fontSize: 14 },
});
