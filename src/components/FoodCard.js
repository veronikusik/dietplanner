import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function FoodCard({ food, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.wrap, pressed && st.pressed]}>
      <LinearGradient colors={['#1A2B1E', '#162118']} style={st.card}>
        <View style={st.top}>
          <Text style={st.emoji}>{food.emoji}</Text>
          <View style={st.badge}><Text style={st.badgeT}>⭐ {food.densityScore}</Text></View>
        </View>
        <Text style={st.name} numberOfLines={1}>{food.name}</Text>
        <Text style={st.cat}>{food.category}</Text>
        {!!food.region && <Text style={st.region} numberOfLines={1}>🌍 {food.region}</Text>}
        <View style={st.macros}>
          <Text style={st.macro}>{food.calories} kcal</Text>
          <Text style={[st.macro, { color: '#60A5FA' }]}>{food.protein}g protein</Text>
          <Text style={[st.macro, { color: '#FB7185' }]}>{food.fiber}g fiber</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wrap: { width: '48%', marginBottom: 12 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  card: { minHeight: 180, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: 'rgba(52,211,153,0.12)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emoji: { fontSize: 36 },
  badge: { backgroundColor: 'rgba(251,191,36,0.18)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeT: { color: '#FBBF24', fontSize: 11, fontWeight: '900' },
  name: { color: '#F1F5F0', fontSize: 16, fontWeight: '900', marginTop: 14 },
  cat: { color: 'rgba(241,245,240,0.45)', fontSize: 11, marginTop: 2 },
  region: { color: '#FBBF24', fontSize: 10, fontWeight: '800', marginTop: 4 },
  macros: { marginTop: 12, gap: 4 },
  macro: { color: 'rgba(241,245,240,0.7)', fontSize: 11, fontWeight: '700' },
});
