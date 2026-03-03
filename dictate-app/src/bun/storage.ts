import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	DEFAULT_MODEL_ID,
	MODEL_CATALOG,
	type ModelCatalogItem,
	type ModelId,
	type ModelInstallStatus,
} from "../shared/models";
import type { DictateSettings, JobRecord, JobStatus } from "../shared/rpc";

const SETTINGS_KEY = "settings";
const LEGACY_DEFAULT_HOTKEY = "Ctrl+Shift+Space";
const CURRENT_DEFAULT_HOTKEY = "Ctrl+Shift";

const DEFAULT_SETTINGS: DictateSettings = {
	hotkey: CURRENT_DEFAULT_HOTKEY,
	defaultModelId: DEFAULT_MODEL_ID,
	autoPasteEnabled: true,
	pasteRetryCount: 1,
	debugLogging: false,
	launchOnStartup: false,
};

interface DbModelRow {
	id: ModelId;
	compatibility_tier: ModelCatalogItem["compatibility"];
	installed: 0 | 1;
	status: ModelInstallStatus;
}

interface DbJobRow {
	id: string;
	status: JobStatus;
	model_id: ModelId;
	created_at: string;
	updated_at: string;
	detail: string;
	transcript_text: string;
}

export class DictateStorage {
	private readonly db: Database;

	constructor(userDataDir: string) {
		mkdirSync(userDataDir, { recursive: true });
		const dbPath = join(userDataDir, "dictate.sqlite");
		this.db = new Database(dbPath);
		this.initSchema();
	}

	private initSchema(): void {
		this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        compatibility_tier TEXT NOT NULL,
        installed INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'not_installed'
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        model_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        detail TEXT NOT NULL,
        transcript_text TEXT NOT NULL DEFAULT ''
      );
    `);

		const jobColumns = this.db.query("PRAGMA table_info(jobs)").all() as {
			name: string;
		}[];
		if (!jobColumns.some((column) => column.name === "transcript_text")) {
			this.db.exec(
				"ALTER TABLE jobs ADD COLUMN transcript_text TEXT NOT NULL DEFAULT ''",
			);
		}

		const existingSettings = this.db
			.query("SELECT value FROM settings WHERE key = ?")
			.get(SETTINGS_KEY) as { value: string } | null;

		if (!existingSettings) {
			this.db
				.query("INSERT INTO settings (key, value) VALUES (?, ?)")
				.run(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
		} else {
			try {
				const parsed = JSON.parse(existingSettings.value) as DictateSettings;
				if (parsed.hotkey === LEGACY_DEFAULT_HOTKEY) {
					parsed.hotkey = CURRENT_DEFAULT_HOTKEY;
					this.db
						.query("UPDATE settings SET value = ? WHERE key = ?")
						.run(JSON.stringify(parsed), SETTINGS_KEY);
				}
			} catch {
				this.db
					.query("UPDATE settings SET value = ? WHERE key = ?")
					.run(JSON.stringify(DEFAULT_SETTINGS), SETTINGS_KEY);
			}
		}

		for (const model of MODEL_CATALOG) {
			this.db
				.query(
					"INSERT OR IGNORE INTO models (id, compatibility_tier) VALUES (?, ?)",
				)
				.run(model.id, model.compatibility);
		}
	}

	getSettings(): DictateSettings {
		const row = this.db
			.query("SELECT value FROM settings WHERE key = ?")
			.get(SETTINGS_KEY) as { value: string } | null;

		if (!row) {
			return { ...DEFAULT_SETTINGS };
		}

		try {
			const parsed = JSON.parse(row.value) as DictateSettings;
			return { ...DEFAULT_SETTINGS, ...parsed };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	updateSettings(next: Partial<DictateSettings>): DictateSettings {
		const merged = { ...this.getSettings(), ...next };
		this.db
			.query("UPDATE settings SET value = ? WHERE key = ?")
			.run(JSON.stringify(merged), SETTINGS_KEY);
		return merged;
	}

	getModels(): ModelCatalogItem[] {
		const dbRows = this.db
			.query("SELECT id, compatibility_tier, installed, status FROM models")
			.all() as DbModelRow[];

		const rowById = new Map<ModelId, DbModelRow>(
			dbRows.map((row) => [row.id, row]),
		);

		return MODEL_CATALOG.map((model) => ({
			...model,
			compatibility:
				rowById.get(model.id)?.compatibility_tier ?? model.compatibility,
			installed: (rowById.get(model.id)?.installed ?? 0) === 1,
			status: rowById.get(model.id)?.status ?? "not_installed",
		}));
	}

	setModelStatus(
		modelId: ModelId,
		next: { installed: boolean; status: ModelInstallStatus },
	): void {
		this.db
			.query("UPDATE models SET installed = ?, status = ? WHERE id = ?")
			.run(next.installed ? 1 : 0, next.status, modelId);
	}

	insertJob(job: JobRecord): void {
		this.db
			.query(
				"INSERT INTO jobs (id, status, model_id, created_at, updated_at, detail, transcript_text) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				job.id,
				job.status,
				job.modelId,
				job.createdAt,
				job.updatedAt,
				job.detail,
				job.transcript,
			);
	}

	updateJob(
		id: string,
		next: Pick<JobRecord, "status" | "updatedAt" | "detail" | "transcript">,
	) {
		this.db
			.query(
				"UPDATE jobs SET status = ?, updated_at = ?, detail = ?, transcript_text = ? WHERE id = ?",
			)
			.run(next.status, next.updatedAt, next.detail, next.transcript, id);
	}

	getLastJob(): JobRecord | null {
		const row = this.db
			.query(
				"SELECT id, status, model_id, created_at, updated_at, detail, transcript_text FROM jobs ORDER BY updated_at DESC LIMIT 1",
			)
			.get() as DbJobRow | null;

		if (!row) {
			return null;
		}

		return {
			id: row.id,
			status: row.status,
			modelId: row.model_id,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			detail: row.detail,
			transcript: row.transcript_text,
		};
	}

	getRecentJobs(limit = 20): JobRecord[] {
		const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
		const rows = this.db
			.query(
				"SELECT id, status, model_id, created_at, updated_at, detail, transcript_text FROM jobs ORDER BY updated_at DESC LIMIT ?",
			)
			.all(safeLimit) as DbJobRow[];

		return rows.map((row) => ({
			id: row.id,
			status: row.status,
			modelId: row.model_id,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			detail: row.detail,
			transcript: row.transcript_text,
		}));
	}

	close(): void {
		this.db.close(false);
	}
}
