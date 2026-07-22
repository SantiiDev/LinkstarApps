import { useState } from 'react';
import './BarChart.css';

const chartData = [
  { day: 'Lun', scans: 145, reviews: 42 },
  { day: 'Mar', scans: 198, reviews: 58 },
  { day: 'Mié', scans: 176, reviews: 51 },
  { day: 'Jue', scans: 220, reviews: 72 },
  { day: 'Vie', scans: 256, reviews: 85 },
  { day: 'Sáb', scans: 310, reviews: 98 },
  { day: 'Dom', scans: 189, reviews: 55 },
];

export default function BarChart() {
  const maxValue = Math.max(...chartData.map(d => Math.max(d.scans, d.reviews)));
  const yLabels = [0, Math.round(maxValue * 0.25), Math.round(maxValue * 0.5), Math.round(maxValue * 0.75), maxValue];

  return (
    <div className="chart-card animate-fade-in-up animate-delay-4">
      <div className="chart-card__header">
        <div className="chart-card__title-group">
          <h3 className="chart-card__title">Rendimiento Semanal</h3>
          <span className="chart-card__subtitle">Escaneos vs Reseñas — Últimos 7 días</span>
        </div>
        <div className="chart-card__legend">
          <div className="chart-card__legend-item">
            <span className="chart-card__legend-dot chart-card__legend-dot--orange"></span>
            Escaneos
          </div>
          <div className="chart-card__legend-item">
            <span className="chart-card__legend-dot chart-card__legend-dot--gold"></span>
            Reseñas
          </div>
        </div>
      </div>

      <div className="chart">
        <div className="chart__y-axis">
          {[...yLabels].reverse().map((label, i) => (
            <span key={i} className="chart__y-label">{label}</span>
          ))}
        </div>

        <div className="chart__container">
          {/* Grid lines */}
          <div className="chart__grid">
            {yLabels.map((_, i) => (
              <div key={i} className="chart__grid-line" />
            ))}
          </div>

          {/* Bars */}
          <div className="chart__bars-wrapper">
            {chartData.map((data, index) => (
              <div key={data.day} className="chart__bar-group">
                <div className="chart__bars">
                  <div
                    className="chart__bar chart__bar--orange"
                    style={{
                      height: `${(data.scans / maxValue) * 100}%`,
                      animationDelay: `${index * 0.08}s`,
                    }}
                  >
                    <span className="chart__bar-tooltip">{data.scans}</span>
                  </div>
                  <div
                    className="chart__bar chart__bar--gold"
                    style={{
                      height: `${(data.reviews / maxValue) * 100}%`,
                      animationDelay: `${index * 0.08 + 0.04}s`,
                    }}
                  >
                    <span className="chart__bar-tooltip">{data.reviews}</span>
                  </div>
                </div>
                <span className="chart__day-label">{data.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
