import { useState } from 'react';
import { hasSeenIntro, markIntroSeen } from './introStorage';
import type { Screen } from './screen';
import { EndScreen } from './screens/EndScreen';
import { IntroScreen } from './screens/IntroScreen';
import { LessonScreen } from './screens/LessonScreen';
import { ModeSelectScreen } from './screens/ModeSelectScreen';
import { ParentGateScreen } from './screens/ParentGateScreen';
import { ZukanScreen } from './screens/ZukanScreen';

export function App() {
  const [screen, setScreen] = useState<Screen>(() => ({ name: hasSeenIntro() ? 'menu' : 'intro' }));
  const toMenu = () => setScreen({ name: 'menu' });

  switch (screen.name) {
    case 'intro':
      return (
        <IntroScreen
          onStart={() => {
            markIntroSeen();
            toMenu();
          }}
        />
      );
    case 'menu':
      return (
        <ModeSelectScreen
          onStartLesson={(mode) => setScreen({ name: 'lesson', mode })}
          onOpenZukan={() => setScreen({ name: 'zukan' })}
          onOpenParentGate={() => setScreen({ name: 'parentGate' })}
        />
      );
    case 'lesson':
      return <LessonScreen mode={screen.mode} onFinish={() => setScreen({ name: 'end' })} />;
    case 'end':
      return <EndScreen onBackToStart={toMenu} />;
    case 'zukan':
      return <ZukanScreen onBack={toMenu} />;
    case 'parentGate':
      return <ParentGateScreen onBack={toMenu} />;
  }
}
