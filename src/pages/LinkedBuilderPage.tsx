import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import PearsonNav from '../components/layout/PearsonNav';
import StepSources from '../components/linked/StepSources';
import StepDetect from '../components/linked/StepDetect';
import StepLinkedCustomise from '../components/linked/StepLinkedCustomise';
import type { JoinDetectResult, ParsedSource } from '../lib/types';
import './LinkedBuilderPage.css';

interface Props { user: User }

type Step = 'sources' | 'detect' | 'customise';

const STEPS: { key: Step; label: string }[] = [
  { key: 'sources',   label: 'Upload sheets' },
  { key: 'detect',    label: 'Detect join key' },
  { key: 'customise', label: 'Configure & publish' },
];

export default function LinkedBuilderPage({ user }: Props) {
  const navigate = useNavigate();
  const [step, setStep]           = useState<Step>('sources');
  const [sources, setSources]     = useState<ParsedSource[]>([]);
  const [joinResult, setJoinResult] = useState<JoinDetectResult | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="lb-page">
      <PearsonNav user={user} />

      {/* Progress bar */}
      <div className="lb-progress">
        <div className="lb-progress__inner">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`lb-progress__step ${i <= stepIndex ? 'lb-progress__step--done' : ''} ${s.key === step ? 'lb-progress__step--active' : ''}`}>
              <div className="lb-progress__dot">
                {i < stepIndex ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span className="lb-progress__label">{s.label}</span>
              {i < STEPS.length - 1 && <div className="lb-progress__connector" />}
            </div>
          ))}
        </div>
      </div>

      <main className="lb-main">
        <div className="lb-content">
          {step === 'sources' && (
            <>
              <StepSources
                sources={sources}
                onChange={setSources}
                onNext={() => setStep('detect')}
              />
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>← Cancel</button>
              </div>
            </>
          )}
          {step === 'detect' && (
            <StepDetect
              sources={sources}
              result={joinResult}
              onResult={setJoinResult}
              onConfirm={(result) => {
                setJoinResult(result);
                setStep('customise');
              }}
              onBack={() => setStep('sources')}
            />
          )}
          {step === 'customise' && joinResult && (
            <StepLinkedCustomise
              sources={sources}
              joinResult={joinResult}
            />
          )}
        </div>
      </main>
    </div>
  );
}
