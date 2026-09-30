import { safeAgentSettings, STUDY_PROVIDERS, type AgentSettings, type AgentStatus, type StudyProvider } from '../../shared/study/contract';
import type { AgentDetector, AgentServicePort, AgentSettingsRepositoryPort } from './ports';

/**
 * Configuración del agente de estudio (proveedor, ruta y modelo de cada CLI) y estado de cada CLI:
 * si se encuentra y si tiene sesión. Valida la configuración que llega por IPC antes de guardarla.
 */
export class AgentService implements AgentServicePort {
  constructor(private readonly repository: AgentSettingsRepositoryPort, private readonly detector: AgentDetector) {}

  settings(): AgentSettings {
    return this.repository.loadAgentSettings();
  }

  saveSettings(settings: unknown): AgentSettings {
    const safe = safeAgentSettings(settings);
    this.repository.saveAgentSettings(safe);
    return safe;
  }

  /** Comprueba los dos proveedores a la vez, con la ruta guardada de cada uno. */
  status(): Promise<AgentStatus[]> {
    const settings = this.repository.loadAgentSettings();
    return Promise.all(STUDY_PROVIDERS.map(provider => this.providerStatus(provider, settings[provider].path)));
  }

  private async providerStatus(provider: StudyProvider, configuredPath: string): Promise<AgentStatus> {
    const configured = configuredPath !== '';
    const path = await this.detector.locate(provider, configuredPath);
    if (path === null) return { provider, availability: 'missing', path, configured };
    return { provider, availability: await this.detector.login(provider, path), path, configured };
  }
}
