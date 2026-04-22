import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PearsonNav from '../components/layout/PearsonNav';
import StepUpload from '../components/builder/StepUpload';
import StepAIConfig from '../components/builder/StepAIConfig';
import StepCustomise from '../components/builder/StepCustomise';
import type { ParsedFile, TableConfig } from '../lib/types';
import './BuilderPage.css';

type Step = 'upload' | 'ai' | 'customise';

const STEPS = ['Upload', 'AI analysis', 'Customise'];

export default function BuilderNewPage() {
  const [searchParams] = useSearchParams();
  const groupId = searchParams.get('groupId') ?? undefined;
  const tabOrder = Number(searchParams.get('tabOrder') ?? 1);

  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [config, setConfig] = useState<TableConfig | null>(null);

  const stepIndex = step === 'upload' ? 0 : step === 'ai' ? 1 : 2;

  return (
    <div>
      <PearsonNav />
      <main className="builder-page">
        {groupId && (
          <div style={{ marginBottom: 16 }}>
            <span className="badge badge-purple">Adding tab to existing table</span>
          </div>
        )}

        <div className="builder-page__progress">
          {STEPS.map((label, i) => (
            <div key={label} className={`builder-step ${i === stepIndex ? 'builder-step--active' : i < stepIndex ? 'builder-step--done' : ''}`}>
              <div className="builder-step__num">{i < stepIndex ? '✓' : i + 1}</div>
              <span className="builder-step__label">{label}</span>
              {i < STEPS.length - 1 && <div className="builder-step__line" />}
            </div>
          ))}
        </div>

        <div className="builder-page__content card">
          {step === 'upload' && (
            <StepUpload onParsed={(data, cfg) => {
              setParsed(data);
              if (cfg) { setConfig(cfg); setStep('customise'); }
              else setStep('ai');
            }} />
          )}
          {step === 'ai' && parsed && (
            <StepAIConfig
              parsed={parsed}
              onAccept={(cfg) => { setConfig(cfg); setStep('customise'); }}
              onBack={() => setStep('upload')}
            />
          )}
          {step === 'customise' && parsed && config && (
            <StepCustomise
              parsed={parsed}
              config={config}
              onBack={() => setStep('ai')}
              groupId={groupId}
              tabOrder={tabOrder}
            />
          )}
        </div>
      </main>
    </div>
  );
}
