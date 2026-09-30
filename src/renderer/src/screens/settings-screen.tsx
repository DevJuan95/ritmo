import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AGENT_NAMES, DEFAULT_AGENT_SETTINGS, MAX_AGENT_PATH, STUDY_PROVIDERS, type AgentSettings, type AgentStatus, type StudyProvider } from '../../../shared/study/contract';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  agentModelHint, agentPathPlaceholder, agentSettingsChanged, agentSettingsProblem, agentStatusView, canSaveDraft, oneAtATime, uncheckedAgents, withProviderSettings
} from '../view';
import type { RunAction } from '../use-ritmo';

interface SettingsScreenProps {
  run: RunAction;
  showError: (error: unknown) => void;
}

export function SettingsScreen({ run, showError }: SettingsScreenProps) {
  const [saved, setSaved] = useState<AgentSettings>();
  const [draft, setDraft] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [statuses, setStatuses] = useState<AgentStatus[]>();
  const [busy, setBusy] = useState(false);
  const [exclusive] = useState(() => oneAtATime(setBusy));

  // El estado siempre corresponde a la configuración guardada: se vuelve a pedir después de guardar.
  const check = useCallback(async () => {
    setStatuses(undefined);
    try { setStatuses(await window.ritmo.checkStudyAgents()); }
    catch (error) { showError(error); setStatuses(uncheckedAgents()); }
  }, [showError]);

  useEffect(() => {
    let active = true;
    window.ritmo.getAgentSettings().then(settings => {
      if (!active) return;
      setSaved(settings);
      setDraft(settings);
    }).catch(error => { if (active) showError(error); });
    void check();
    return () => { active = false; };
  }, [check, showError]);

  const problem = agentSettingsProblem(draft);
  const changed = saved !== undefined && agentSettingsChanged(draft, saved);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (problem || !changed) return;
    await exclusive(async () => {
      let stored: AgentSettings | undefined;
      if (await run(async () => { stored = await window.ritmo.saveAgentSettings(draft); }) && stored) {
        setSaved(stored);
        setDraft(stored);
        await check();
      }
    });
  }

  const patch = (provider: StudyProvider, changes: Parameters<typeof withProviderSettings>[2]) => setDraft(withProviderSettings(draft, provider, changes));

  return <section className="settings-panel" aria-labelledby="settings-heading">
    <div className="planner-header">
      <div className="sheet-head"><h2 id="settings-heading">Ajustes</h2><p className="section-subtitle">Elige qué agente propone las tareas de tus rutas de estudio.</p></div>
    </div>

    <form className="agent-sheet" aria-labelledby="agent-heading" onSubmit={event => void save(event)}>
      <h3 id="agent-heading" className="planner-day-heading">Agente de estudio</h3>
      <p className="agent-intro">
        Ritmo usa Claude Code o Codex tal como los tienes instalados, con la sesión de tu suscripción y nunca con una clave de API.
        Cada petición cuenta para los límites de tu plan, así que por defecto se usa un modelo ligero. Solo se envía la ruta cuando pides tareas.
      </p>

      <fieldset className="agent-options" disabled={saved === undefined}>
        <legend>Proveedor</legend>
        {STUDY_PROVIDERS.map(provider => {
          const status = statuses?.find(item => item.provider === provider);
          const view = agentStatusView(provider, status);
          const selected = draft.provider === provider;
          const statusId = `agent-status-${provider}`;
          return <div key={provider} className="agent-option" data-selected={selected}>
            <label className="agent-choice">
              <input type="radio" name="agent-provider" value={provider} checked={selected} aria-describedby={statusId} onChange={() => setDraft({ ...draft, provider })} />
              <span className="agent-name">{AGENT_NAMES[provider]}</span>
              <span className="agent-state" data-tone={view.tone}>{view.label}</span>
            </label>
            <p id={statusId} className="agent-detail" aria-live="polite">
              {view.detail}
            </p>
            <div className="agent-fields">
              <label className="study-field"><span>Ruta del ejecutable</span>
                <Input value={draft[provider].path} maxLength={MAX_AGENT_PATH} spellCheck={false} autoCapitalize="off" placeholder={agentPathPlaceholder(status)} onChange={event => patch(provider, { path: event.target.value })} />
                <small>Déjala vacía para buscarlo en las carpetas de instalación habituales y en el PATH de tu shell.</small>
              </label>
              <label className="study-field"><span>Modelo</span>
                <Input value={draft[provider].model} maxLength={100} spellCheck={false} autoCapitalize="off" placeholder="El del CLI" onChange={event => patch(provider, { model: event.target.value })} />
                <small>{agentModelHint(provider)}</small>
              </label>
            </div>
          </div>;
        })}
      </fieldset>

      <div className="study-footer">
        <p className="study-hint" aria-live="polite">{changed ? problem ?? 'Cambios sin guardar. Al guardarlos, se vuelve a comprobar cada agente.' : ''}</p>
        <div className="study-footer-actions">
          <Button type="button" variant="ghost" className="row-action" disabled={busy || statuses === undefined} onClick={() => void check()}>Comprobar de nuevo</Button>
          {changed && <Button type="button" variant="ghost" className="row-action" disabled={busy} onClick={() => saved && setDraft(saved)}>Descartar cambios</Button>}
          <Button type="submit" disabled={!canSaveDraft(changed, problem, busy)}>Guardar cambios</Button>
        </div>
      </div>
    </form>
  </section>;
}
