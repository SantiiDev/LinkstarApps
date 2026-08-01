import './EmployeeRanking.css';

const employees = [
  { id: 1, name: 'Sofía Martínez', initials: 'SM', reviews: 87, color: '#F58529' },
  { id: 2, name: 'Diego López', initials: 'DL', reviews: 72, color: '#1A2639' },
  { id: 3, name: 'Valentina Ruiz', initials: 'VR', reviews: 65, color: '#10B981' },
  { id: 4, name: 'Mateo García', initials: 'MG', reviews: 48, color: '#F59E0B' },
  { id: 5, name: 'Isabella Torres', initials: 'IT', reviews: 34, color: '#6366f1' },
];

export default function EmployeeRanking() {
  const maxReviews = employees[0].reviews;

  return (
    <div className="ranking-card animate-fade-in-up animate-delay-5">
      <div className="ranking-card__header">
        <div>
          <h3 className="ranking-card__title">🏆 Ranking de Empleados</h3>
          <span className="ranking-card__subtitle">Top reseñas conseguidas este mes</span>
        </div>
      </div>

      <div className="ranking-list">
        {employees.map((employee, index) => {
          const position = index + 1;
          const positionClass = position <= 3
            ? `ranking-item__position--${position}`
            : 'ranking-item__position--default';

          return (
            <div
              key={employee.id}
              className={`ranking-item ${position === 1 ? 'ranking-item--first' : ''}`}
              style={{ animationDelay: `${0.5 + index * 0.1}s` }}
            >
              <div className={`ranking-item__position ${positionClass}`}>
                {position}
              </div>

              <div
                className="ranking-item__avatar"
                style={{ background: employee.color }}
              >
                {employee.initials}
              </div>

              <div className="ranking-item__info">
                <div className="ranking-item__name">{employee.name}</div>
                <div className="ranking-item__progress-bar">
                  <div
                    className="ranking-item__progress-fill"
                    style={{ width: `${(employee.reviews / maxReviews) * 100}%` }}
                  />
                </div>
              </div>

              <div className="ranking-item__stats">
                <span className="ranking-item__reviews">{employee.reviews}</span>
                <span className="ranking-item__label">Reseñas</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
