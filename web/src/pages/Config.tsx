import { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Save,
  CheckCircle,
  AlertTriangle,
  ShieldAlert,
  Cpu,
  Globe,
  Thermometer,
  Key,
  Link,
  Server,
  Code,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import { getConfig, putConfig } from '@/lib/api';
import { t } from '@/lib/i18n';

/** Attempt to restart the Tauri desktop app via the process plugin. */
async function restartApp(): Promise<void> {
  try {
    // Tauri v2 injects __TAURI__ globals when running inside the WebView
    const tauri = (window as Record<string, unknown>).__TAURI__ as
      | { core?: { invoke: (cmd: string) => Promise<unknown> } }
      | undefined;
    if (tauri?.core?.invoke) {
      await tauri.core.invoke('plugin:process|restart');
    } else {
      // Fallback: just reload the page (dev mode / browser)
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

// ---------------------------------------------------------------------------
// Minimal TOML parser/serializer for the fields we care about.
// We parse key top-level and [gateway] fields into a structured form,
// and preserve everything else as raw TOML for the advanced editor.
// ---------------------------------------------------------------------------

interface ParsedConfig {
  default_provider: string;
  default_model: string;
  api_key: string;
  api_url: string;
  default_temperature: number;
  gateway_host: string;
  gateway_port: number;
  gateway_require_pairing: boolean;
}

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'glm', label: 'GLM (ZhipuAI)' },
  { value: 'compatible', label: 'OpenAI Compatible' },
];

/** Parse a flat TOML string into our structured form + leftover raw lines */
function parseToml(raw: string): { parsed: ParsedConfig; rawLines: string[] } {
  const lines = raw.split('\n');
  const parsed: ParsedConfig = {
    default_provider: 'openrouter',
    default_model: '',
    api_key: '',
    api_url: '',
    default_temperature: 0.7,
    gateway_host: '127.0.0.1',
    gateway_port: 42617,
    gateway_require_pairing: false,
  };
  const rawLines: string[] = [];
  let inGateway = false;
  let inOtherSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect section headers
    if (/^\[gateway\]\s*$/.test(trimmed)) {
      inGateway = true;
      inOtherSection = false;
      continue;
    }
    if (/^\[/.test(trimmed) && !/^\[gateway\]/.test(trimmed)) {
      inGateway = false;
      inOtherSection = true;
      rawLines.push(line);
      continue;
    }
    if (inOtherSection) {
      rawLines.push(line);
      continue;
    }

    // Top-level or [gateway] key=value
    const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (!match) {
      // Keep comments and blank lines that aren't in our managed sections
      if (!inGateway && trimmed !== '') rawLines.push(line);
      continue;
    }
    const [, key, rawVal] = match;
    const val = rawVal.replace(/^["']|["']$/g, '').trim();

    if (inGateway) {
      switch (key) {
        case 'host': parsed.gateway_host = val; break;
        case 'port': parsed.gateway_port = parseInt(val, 10) || 42617; break;
        case 'require_pairing': parsed.gateway_require_pairing = val === 'true'; break;
        default: rawLines.push(`# [gateway] ${line.trim()}`); break;
      }
    } else {
      switch (key) {
        case 'default_provider':
        case 'model_provider':
          parsed.default_provider = val; break;
        case 'default_model':
        case 'model':
          parsed.default_model = val; break;
        case 'api_key': parsed.api_key = val; break;
        case 'api_url': parsed.api_url = val; break;
        case 'default_temperature': parsed.default_temperature = parseFloat(val) || 0.7; break;
        default: rawLines.push(line); break;
      }
    }
  }
  return { parsed, rawLines };
}

/** Serialize back to TOML, merging form values with raw lines */
function serializeToml(parsed: ParsedConfig, rawLines: string[]): string {
  const parts: string[] = [];

  // Top-level LLM fields
  if (parsed.default_provider) parts.push(`default_provider = "${parsed.default_provider}"`);
  if (parsed.default_model) parts.push(`default_model = "${parsed.default_model}"`);
  if (parsed.api_key && !parsed.api_key.startsWith('***')) parts.push(`api_key = "${parsed.api_key}"`);
  if (parsed.api_url) parts.push(`api_url = "${parsed.api_url}"`);
  parts.push(`default_temperature = ${parsed.default_temperature}`);
  parts.push('');

  // Gateway section
  parts.push('[gateway]');
  parts.push(`host = "${parsed.gateway_host}"`);
  parts.push(`port = ${parsed.gateway_port}`);
  parts.push(`require_pairing = ${parsed.gateway_require_pairing}`);
  parts.push('');

  // Remaining raw config
  const rest = rawLines.filter((l) => l.trim() !== '').join('\n');
  if (rest) {
    parts.push(rest);
  }

  return parts.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function InputField({
  label,
  icon: Icon,
  value,
  onChange,
  type = 'text',
  placeholder,
  description,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  description?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1.5">
        <Icon className="h-4 w-4 text-gray-500" />
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
      />
      {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
    </div>
  );
}

function SelectField({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  description,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  description?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1.5">
        <Icon className="h-4 w-4 text-gray-500" />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors appearance-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Config Page
// ---------------------------------------------------------------------------

export default function Config() {
  const [rawToml, setRawToml] = useState('');
  const [form, setForm] = useState<ParsedConfig | null>(null);
  const [extraLines, setExtraLines] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedToml, setAdvancedToml] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    getConfig()
      .then((data) => {
        const tomlStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        setRawToml(tomlStr);
        const { parsed, rawLines } = parseToml(tomlStr);
        setForm(parsed);
        setExtraLines(rawLines);
        setAdvancedToml(tomlStr);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const updateField = useCallback(<K extends keyof ParsedConfig>(key: K, value: ParsedConfig[K]) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const toml = showAdvanced ? advancedToml : serializeToml(form, extraLines);
      await putConfig(toml);
      setSuccess('Configuration saved successfully.');
      setNeedsRestart(true);
      setRawToml(toml);
      // Re-parse to keep in sync
      if (showAdvanced) {
        const { parsed, rawLines } = parseToml(toml);
        setForm(parsed);
        setExtraLines(rawLines);
      } else {
        setAdvancedToml(toml);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Auto-dismiss success after 4 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-blue-400" />
          <h2 className="text-base font-semibold text-white">{t('config.configuration')}</h2>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? t('config.saving') : t('common.save')}
        </button>
      </div>

      {/* Success message + restart prompt */}
      {success && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-900/30 border border-green-700 rounded-lg p-3">
            <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
            <span className="text-sm text-green-300">{success}</span>
          </div>
          {needsRestart && (
            <div className="flex items-center justify-between bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                <span className="text-sm text-yellow-300">{t('config.restart_required')}</span>
              </div>
              <button
                onClick={restartApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-600 hover:bg-yellow-700 text-white transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('config.restart_app')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {!showAdvanced && form && (
        <>
          {/* LLM Provider Section */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">{t('config.llm_provider')}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('config.llm_desc')}</p>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <SelectField
                label={t('config.provider')}
                icon={Cpu}
                value={form.default_provider}
                onChange={(v) => updateField('default_provider', v)}
                options={PROVIDERS}
                description={t('config.provider_desc')}
              />
              <InputField
                label={t('config.model')}
                icon={Code}
                value={form.default_model}
                onChange={(v) => updateField('default_model', v)}
                placeholder="e.g. anthropic/claude-sonnet-4-6"
                description={t('config.model_desc')}
              />
              <InputField
                label={t('config.api_key')}
                icon={Key}
                value={form.api_key}
                onChange={(v) => updateField('api_key', v)}
                type="password"
                placeholder="sk-..."
                description={t('config.api_key_desc')}
              />
              <InputField
                label={t('config.api_url')}
                icon={Link}
                value={form.api_url}
                onChange={(v) => updateField('api_url', v)}
                placeholder="https://api.example.com/v1"
                description={t('config.api_url_desc')}
              />
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1.5">
                  <Thermometer className="h-4 w-4 text-gray-500" />
                  {t('config.temperature')}: {form.default_temperature.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={form.default_temperature}
                  onChange={(e) => updateField('default_temperature', parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.0 ({t('config.precise')})</span>
                  <span>1.0 ({t('config.balanced')})</span>
                  <span>2.0 ({t('config.creative')})</span>
                </div>
              </div>
            </div>
          </div>

          {/* Gateway Section */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-green-400" />
                <span className="text-sm font-semibold text-white">{t('config.gateway')}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{t('config.gateway_desc')}</p>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <InputField
                label={t('config.host')}
                icon={Globe}
                value={form.gateway_host}
                onChange={(v) => updateField('gateway_host', v)}
                placeholder="127.0.0.1"
                description={t('config.host_desc')}
              />
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1.5">
                  <Server className="h-4 w-4 text-gray-500" />
                  {t('config.port')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.gateway_port}
                  onChange={(e) => updateField('gateway_port', parseInt(e.target.value, 10) || 42617)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">Default: 42617</p>
              </div>
            </div>
          </div>

          {/* Sensitive fields note */}
          <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-4">
            <ShieldAlert className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-yellow-300 font-medium">
                {t('config.sensitive_title')}
              </p>
              <p className="text-sm text-yellow-400/70 mt-0.5">
                {t('config.sensitive_desc')}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Advanced TOML Editor */}
      {showAdvanced && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-800/50">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
              {t('config.toml_config')}
            </span>
            <span className="text-xs text-gray-500">
              {advancedToml.split('\n').length} {t('config.lines')}
            </span>
          </div>
          <textarea
            value={advancedToml}
            onChange={(e) => setAdvancedToml(e.target.value)}
            spellCheck={false}
            className="w-full min-h-[500px] bg-gray-950 text-gray-200 font-mono text-sm p-4 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
            style={{ tabSize: 4 }}
          />
        </div>
      )}

      {/* Toggle Advanced */}
      <button
        type="button"
        onClick={() => {
          if (!showAdvanced && form) {
            // Sync form → TOML before switching
            setAdvancedToml(serializeToml(form, extraLines));
          } else if (showAdvanced) {
            // Sync TOML → form before switching
            const { parsed, rawLines } = parseToml(advancedToml);
            setForm(parsed);
            setExtraLines(rawLines);
          }
          setShowAdvanced(!showAdvanced);
        }}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {showAdvanced ? t('config.switch_form') : t('config.switch_advanced')}
      </button>
    </div>
  );
}
