import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import PearsonNav from '../components/layout/PearsonNav';
import StepCustomise from '../components/builder/StepCustomise';
import StepUpload from '../components/builder/StepUpload';
import StepAIConfig from '../components/builder/StepAIConfig';
import DataEditor from '../components/builder/DataEditor';
import VersionHistoryModal from '../components/builder/VersionHistoryModal';
import type { ParsedFile, TableConfig, TableRecord, TableRow } from '../lib/types';
import { fetchAllRows } from '../utils/fetchAllRows';
import {
  alignColumnsToFile,
  columnsFromFile,
  dropColumnsMissingFromFile,
  reconcileColumns,
  replaceTableStructure,
  type ReconcileResult,
} from '../utils/reconcileColumns';
import './BuilderPage.css';
import './BuilderEditPage.css';

type Tab = 'configure' | 'data';

/**
 * How a re-uploaded file meets the table it replaces.
 * - 'replace': the file defines the columns. Columns it doesn't contain are removed.
 * - 'merge':   only the rows change. Existing columns and their settings stay put.
 */
type ReplaceMode = 'replace' | 'merge';

/** Where the re-upload has got to: picking a file, or reviewing the AI's reading of it. */
type ReuploadStep = 'upload' | 'analyse';

interface Props { user: User }

export default function BuilderEditPage({ user }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [table, setTable] = useState<TableRecord | null>(null);
  const [existingRows, setExistingRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('configure');
  const [reuploadStep, setReuploadStep] = useState<ReuploadStep | null>(null);
  const [replaceMode, setReplaceMode] = useState<ReplaceMode>('replace');
  const [pendingParsed, setPendingParsed] = useState<ParsedFile | null>(null);
  const [newParsed, setNewParsed] = useState<ParsedFile | null>(null);
  const [reuploadConfig, setReuploadConfig] = useState<TableConfig | null>(null);
  const [columnNotice, setColumnNotice] = useState<(ReconcileResult & { mode: ReplaceMode }) | null>(null);
  // Bumped whenever the column structure is rebuilt outside the Customise step,
  // so that step remounts and picks the new structure up.
  const [structureVersion, setStructureVersion] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  const loadTable = async () => {
    if (!id) return;
    const { data: t } = await supabase.from('tables').select('*').eq('id', id).single();
    if (!t) { setError('Table not found.'); setLoading(false); return; }
    setTable(t as TableRecord);
    const allRows = await fetchAllRows(id);
    setExistingRows(allRows);
    setLoading(false);
  };

  useEffect(() => { void loadTable(); }, [id]);

  if (loading) return (
    <div>
      <PearsonNav user={user} />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
        <div className="spinner spinner-lg" />
      </div>
    </div>
  );

  if (error || !table) return (
    <div>
      <PearsonNav user={user} />
      <div style={{ maxWidth: 600, margin: '80px auto', padding: '0 24px' }}>
        <p className="error-msg">{error || 'Table not found.'}</p>
        <button className="btn btn-secondary mt-16" onClick={() => navigate('/dashboard')}>← Dashboard</button>
      </div>
    </div>
  );

  const existingParsed: ParsedFile = {
    headers: table.config.columns.map((c) => c.key),
    rows: existingRows.map((r) =>
      Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, String(v ?? '')])),
    ),
  };
  const activeParsed = newParsed ?? existingParsed;
  const activeConfig = reuploadConfig ?? table.config;

  // Hand the new file and its config to the Customise step and close the re-upload flow.
  const applyUpload = (parsed: ParsedFile, result: ReconcileResult, mode: ReplaceMode) => {
    setNewParsed(parsed);
    setReuploadConfig(result.config);
    const worthSaying =
      result.addedColumns.length || result.removedColumns.length || result.emptyColumns.length;
    setColumnNotice(worthSaying ? { ...result, mode } : null);
    setPendingParsed(null);
    setReuploadStep(null);
    setStructureVersion((v) => v + 1);
  };

  // Replace mode: the file defines the columns. An AI config supplies the labels,
  // types and filters; without one we infer them from the file's own headers.
  const applyReplace = (parsed: ParsedFile, aiConfig?: TableConfig) => {
    const columns = aiConfig
      ? alignColumnsToFile(aiConfig.columns, parsed)
      : columnsFromFile(parsed, table.config.columns);
    const hints = aiConfig
      ? { primarySearchColumn: aiConfig.primarySearchColumn, defaultSort: aiConfig.defaultSort }
      : undefined;
    applyUpload(parsed, replaceTableStructure(table.config, columns, parsed, hints), 'replace');
  };

  const cancelReupload = () => {
    setReuploadStep(null);
    setPendingParsed(null);
  };

  // Merge mode leaves columns the file doesn't contain in place; this clears them
  // out in one go for anyone who decides they aren't needed after all.
  const removeMissingColumns = () => {
    if (!newParsed || !reuploadConfig) return;
    const config = dropColumnsMissingFromFile(reuploadConfig, newParsed);
    setReuploadConfig(config);
    setColumnNotice((n) => (n ? { ...n, config, removedColumns: [] } : n));
    setStructureVersion((v) => v + 1);
  };

  return (
    <div>
      <PearsonNav user={user} />
      <main className="builder-page">
        <div className="builder-edit__header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>← Dashboard</button>
          <div className="builder-edit__tabs">
            <button
              className={`builder-edit__tab ${tab === 'configure' ? 'builder-edit__tab--active' : ''}`}
              onClick={() => setTab('configure')}
            >
              Configure
            </button>
            <button
              className={`builder-edit__tab ${tab === 'data' ? 'builder-edit__tab--active' : ''}`}
              onClick={() => setTab('data')}
            >
              Edit data
              {existingRows.length > 0 && (
                <span className="builder-edit__tab-count">{existingRows.length.toLocaleString()}</span>
              )}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'configure' && (
              <button className="btn btn-secondary btn-sm" onClick={() => setReuploadStep('upload')}>
                Replace data file
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowHistory(true)}
              title="View previous published versions and roll back if needed"
            >
              Version history
            </button>
            {!table.tab_group_id && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/builder/new?groupId=${table.id}&tabOrder=${existingRows.length > 0 ? 1 : 1}`)}
                title="Add a second dataset as a tab on the same published page"
              >
                + Add tab
              </button>
            )}
            {table.is_published && (
              <a
                href={`/t/${table.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
              >
                View live ↗
              </a>
            )}
          </div>
        </div>

        <div className="builder-page__content card">
          {tab === 'configure' && (
            reuploadStep === 'upload' ? (
              <div>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={cancelReupload}>
                  ← Cancel
                </button>

                {/* What should happen to the columns this table already has? */}
                <fieldset className="builder-edit__mode">
                  <legend className="builder-edit__mode-legend">What should the new file replace?</legend>

                  <label className={`builder-edit__mode-option ${replaceMode === 'replace' ? 'builder-edit__mode-option--on' : ''}`}>
                    <input
                      type="radio"
                      name="replace-mode"
                      checked={replaceMode === 'replace'}
                      onChange={() => setReplaceMode('replace')}
                    />
                    <span>
                      <span className="builder-edit__mode-title">Everything — columns and rows</span>
                      <span className="builder-edit__mode-desc">
                        The table is rebuilt from the new file. Columns the file doesn't contain are removed,
                        and the headings, types and filters come from the file. Choose this when the
                        structure has changed.
                      </span>
                    </span>
                  </label>

                  <label className={`builder-edit__mode-option ${replaceMode === 'merge' ? 'builder-edit__mode-option--on' : ''}`}>
                    <input
                      type="radio"
                      name="replace-mode"
                      checked={replaceMode === 'merge'}
                      onChange={() => setReplaceMode('merge')}
                    />
                    <span>
                      <span className="builder-edit__mode-title">Just the rows</span>
                      <span className="builder-edit__mode-desc">
                        Your current columns, labels, filters and widgets stay exactly as they are. Choose
                        this for a routine data refresh where the file has the same columns.
                      </span>
                    </span>
                  </label>
                </fieldset>

                <StepUpload
                  onParsed={(data, cfg) => {
                    if (replaceMode === 'merge') {
                      applyUpload(data, reconcileColumns(table.config, data), 'merge');
                      return;
                    }
                    // A PDF arrives with its config already extracted; a spreadsheet
                    // goes through the AI analysis step first.
                    if (cfg) {
                      applyReplace(data, cfg);
                      return;
                    }
                    setPendingParsed(data);
                    setReuploadStep('analyse');
                  }}
                />
              </div>
            ) : reuploadStep === 'analyse' && pendingParsed ? (
              <StepAIConfig
                parsed={pendingParsed}
                onAccept={(cfg, cleanedParsed) => applyReplace(cleanedParsed ?? pendingParsed, cfg)}
                onBack={() => setReuploadStep('upload')}
                onSkip={() => applyReplace(pendingParsed)}
              />
            ) : (
              <>
                {columnNotice && (
                  <div className="builder-edit__col-notice">
                    {columnNotice.addedColumns.length > 0 && (
                      <p>
                        ✓ {columnNotice.addedColumns.length} new{' '}
                        {columnNotice.addedColumns.length === 1 ? 'column' : 'columns'} from your file{' '}
                        {columnNotice.addedColumns.length === 1 ? 'has' : 'have'} been added:{' '}
                        <strong>{columnNotice.addedColumns.join(', ')}</strong>. Review the settings below,
                        then Save or Publish to apply.
                      </p>
                    )}
                    {columnNotice.removedColumns.length > 0 && columnNotice.mode === 'replace' && (
                      <p>
                        ✓ {columnNotice.removedColumns.length}{' '}
                        {columnNotice.removedColumns.length === 1 ? 'column' : 'columns'} not in the new file{' '}
                        {columnNotice.removedColumns.length === 1 ? 'has' : 'have'} been removed:{' '}
                        <strong>{columnNotice.removedColumns.join(', ')}</strong>. Save or Publish to apply.
                      </p>
                    )}
                    {columnNotice.removedColumns.length > 0 && columnNotice.mode === 'merge' && (
                      <p>
                        ⚠ {columnNotice.removedColumns.length}{' '}
                        {columnNotice.removedColumns.length === 1 ? 'column is' : 'columns are'} not in the new
                        file and will be left blank: <strong>{columnNotice.removedColumns.join(', ')}</strong>.{' '}
                        <button className="builder-edit__col-notice-action" onClick={removeMissingColumns}>
                          Remove {columnNotice.removedColumns.length === 1 ? 'it' : 'them'}
                        </button>{' '}
                        or hide {columnNotice.removedColumns.length === 1 ? 'it' : 'them'} below to keep the
                        data.
                      </p>
                    )}
                    {columnNotice.emptyColumns.length > 0 && (
                      <p>
                        • {columnNotice.emptyColumns.length}{' '}
                        {columnNotice.emptyColumns.length === 1 ? 'column has' : 'columns have'} no values
                        anywhere in your file, so {columnNotice.emptyColumns.length === 1 ? 'it is' : 'they are'}{' '}
                        hidden: <strong>{columnNotice.emptyColumns.join(', ')}</strong>. Switch{' '}
                        {columnNotice.emptyColumns.length === 1 ? 'it' : 'them'} back on below if you plan to
                        fill {columnNotice.emptyColumns.length === 1 ? 'it' : 'them'} in.
                      </p>
                    )}
                  </div>
                )}
                <StepCustomise
                  key={`customise-${structureVersion}`}
                  parsed={activeParsed}
                  config={activeConfig}
                  onBack={() => navigate('/dashboard')}
                  editingId={table.id}
                />
              </>
            )
          )}

          {tab === 'data' && (
            <DataEditor
              tableId={table.id}
              config={table.config}
              initialRows={existingRows}
              onSaved={() => void loadTable()}
            />
          )}
        </div>
      </main>

      {showHistory && (
        <VersionHistoryModal
          tableId={table.id}
          tableTitle={table.title}
          onClose={() => setShowHistory(false)}
          onRestored={() => {
            setShowHistory(false);
            setNewParsed(null);
            setReuploadConfig(null);
            setColumnNotice(null);
            setStructureVersion((v) => v + 1);
            void loadTable();
          }}
        />
      )}
    </div>
  );
}
