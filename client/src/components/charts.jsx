import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from 'recharts';
import { fmt0, fmtDay } from '../api.js';

export const GOLD = '#d4a017';
const PALETTE = ['#d4a017', '#8c2f23', '#1e7d45', '#1f5f8b', '#b8860b', '#6b5433', '#c0392b', '#7d6608', '#2e86ab', '#935116'];

const tipStyle = { background: '#fffdf6', border: '1px solid #e9dfc8', borderRadius: 10, fontSize: 13 };
const money = (v) => fmt0(v);
const shortDay = (d) => String(d).slice(8, 10) + '/' + String(d).slice(5, 7);

export function TrendChart({ data, x = 'day', series, height = 240, kind = 'area' }) {
  const C = kind === 'bar' ? BarChart : kind === 'line' ? LineChart : AreaChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <C data={data} margin={{ top: 8, right: 10, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee4cd" />
        <XAxis dataKey={x} tick={{ fontSize: 11, fill: '#8a7a5c' }} tickFormatter={x === 'day' ? shortDay : undefined} />
        <YAxis tick={{ fontSize: 11, fill: '#8a7a5c' }} tickFormatter={(v) => v >= 1000 ? (v / 1000) + 'k' : v} width={46} />
        <Tooltip contentStyle={tipStyle} formatter={(v, n) => [money(v), n]} labelFormatter={x === 'day' ? (l) => fmtDay(l) : undefined} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => kind === 'bar'
          ? <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || PALETTE[i]} radius={[5, 5, 0, 0]} />
          : kind === 'line'
            ? <Line key={s.key} dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i]} strokeWidth={2.4} dot={false} />
            : <Area key={s.key} dataKey={s.key} name={s.label} stroke={s.color || PALETTE[i]} strokeWidth={2.2} fill={s.color || PALETTE[i]} fillOpacity={0.14} />)}
      </C>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={tipStyle} formatter={(v, n) => [money(v), n]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, height = 240, color = GOLD, labelKey = 'name', valueKey = 'amount' }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 14, left: 10, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 11, fill: '#8a7a5c' }} tickFormatter={(v) => v >= 1000 ? (v / 1000) + 'k' : v} />
        <YAxis type="category" dataKey={labelKey} width={120} tick={{ fontSize: 11.5, fill: '#2d2314' }} />
        <Tooltip contentStyle={tipStyle} formatter={(v) => [money(v)]} />
        <Bar dataKey={valueKey} fill={color} radius={[0, 5, 5, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
