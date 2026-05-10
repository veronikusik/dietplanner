import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

export default function MetricPill({ label, value, tone = '#34D399' }) {
  return (
    <View style={[st.pill, { borderColor: `${tone}40`, backgroundColor: `${tone}14` }]}>
      <Text style={[st.val, { color: tone }]}>{value}</Text>
      <Text style={st.lab}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pill: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 9, minWidth: 90 },
  val: { fontSize: 18, fontWeight: '900' },
  lab: { color: 'rgba(241,245,240,0.55)', fontSize: 10, fontWeight: '700', marginTop: 2 },
});
