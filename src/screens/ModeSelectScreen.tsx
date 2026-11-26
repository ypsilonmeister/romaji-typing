import { LESSON_IDS, nextRecommendedStage, STAGES, type StageId } from '../lesson';
import { isLessonUnlocked } from '../progress';
import type { LessonMode } from '../screen';

type Props = {
  clearedLessonIds: ReadonlySet<string>;
  onStartLesson: (mode: LessonMode) => void;
  onStartStage: (stageId: StageId) => void;
  onStartShiritori: () => void;
  onOpenZukan: () => void;
  onOpenParentGate: () => void;
};

/** モード選択画面。 */
export function ModeSelectScreen({
  clearedLessonIds,
  onStartLesson,
  onStartStage,
  onStartShiritori,
  onOpenZukan,
  onOpenParentGate,
}: Props) {
  const recommendedId = nextRecommendedStage(clearedLessonIds);
  const recommendedStage = STAGES.find((stage) => stage.id === recommendedId) ?? STAGES[0];

  return (
    <main className="screen screen-menu">
      <header className="bar">
        <h1>タイプクラフト</h1>
        {/* 仮の入口。誤操作を防ぐ開き方は後続で置き換える。 */}
        <button type="button" className="button button-quiet" onClick={onOpenParentGate}>
          おうちのひと
        </button>
      </header>
      <div className="cards">
        <button type="button" className="card" onClick={() => onStartLesson('stage')}>
          <span className="card-title">レッスン</span>
          <span>
            Stage {recommendedStage.code} から れんしゅう
          </span>
        </button>
        <button type="button" className="card" onClick={() => onStartLesson('theme')}>
          <span className="card-title">テーマで あそぶ</span>
          <span>ことばを うって あそぶ</span>
        </button>
        <button type="button" className="card" onClick={onStartShiritori}>
          <span className="card-title">しりとり</span>
          <span>ことばを つなげて あそぶ</span>
        </button>
      </div>
      <section className="stage-list" aria-label="ステージ選択">
        {STAGES.map((stage) => {
          const unlocked = isLessonUnlocked(LESSON_IDS, stage.id, clearedLessonIds);
          const cleared = clearedLessonIds.has(stage.id);
          return (
            <button
              key={stage.id}
              type="button"
              className={`stage-button${unlocked ? '' : ' stage-button-locked'}`}
              disabled={!unlocked}
              onClick={() => onStartStage(stage.id)}
              data-stage-id={stage.id}
              data-unlocked={unlocked ? 'true' : 'false'}
            >
              <span className="stage-button-title">
                Stage {stage.code}: {stage.title}
              </span>
              <span className="stage-badge">
                {cleared ? 'クリア' : unlocked ? 'あそべる' : 'まだ ロック中'}
              </span>
            </button>
          );
        })}
      </section>
      <button type="button" className="button" onClick={onOpenZukan}>
        ことば図鑑
      </button>
    </main>
  );
}
