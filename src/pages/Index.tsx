import { useState } from 'react';
import ScheduleSystem from '@/components/ScheduleSystem';

const Index = () => {
  const [showPigeon, setShowPigeon] = useState(false);

  const handleFirstPress = () => {
    if (showPigeon) return;

    setShowPigeon(true);
    window.setTimeout(() => setShowPigeon(false), 1800);
  };

  return (
    <div onPointerDown={handleFirstPress} className="relative">
      {showPigeon && (
        <span className="pigeon-fly" aria-hidden="true">
          🕊️
        </span>
      )}
      <ScheduleSystem />
    </div>
  );
};

export default Index;
