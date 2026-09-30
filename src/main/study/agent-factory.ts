import type { StudyProvider } from '../../shared/study/contract';
import { ClaudeCodeAgent } from './claude-code-agent';
import { CodexAgent } from './codex-agent';
import type { StudyAgent, StudyAgentCli, StudyAgentFactory } from './ports';

/** Crea el adaptador del CLI de cada proveedor; un modelo vacío deja el que tenga configurado el CLI. */
export class CliStudyAgentFactory implements StudyAgentFactory {
  create(provider: StudyProvider, { command, model }: StudyAgentCli): StudyAgent {
    const options = { command, model: model || undefined };
    return provider === 'claude' ? new ClaudeCodeAgent(options) : new CodexAgent(options);
  }
}
