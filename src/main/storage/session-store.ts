import Database from "better-sqlite3";
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SessionRecord, SessionWithSegments, TranscriptSegment } from "@shared/types";

type SessionRow = Omit<SessionRecord, "usedCloudRefinement"> & {
  usedCloudRefinement: number;
};

export class SessionStore {
  private readonly db: Database.Database;

  constructor(databasePath?: string) {
    const dbPath = databasePath ?? join(app.getPath("userData"), "lisn.sqlite");
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.migrate();
  }

  listSessions(): SessionRecord[] {
    const rows = this.db
      .prepare(
        `select
          id,
          source_id as sourceId,
          source_name as sourceName,
          source_kind as sourceKind,
          source_app_name as sourceAppName,
          status,
          started_at as startedAt,
          ended_at as endedAt,
          engine,
          used_cloud_refinement as usedCloudRefinement,
          audio_path as audioPath,
          export_path as exportPath,
          error_message as errorMessage
        from sessions
        order by started_at desc`
      )
      .all() as SessionRow[];

    return rows.map((row) => this.normalizeSession(row));
  }

  getSession(sessionId: string): SessionWithSegments | null {
    const session = this.db
      .prepare(
        `select
          id,
          source_id as sourceId,
          source_name as sourceName,
          source_kind as sourceKind,
          source_app_name as sourceAppName,
          status,
          started_at as startedAt,
          ended_at as endedAt,
          engine,
          used_cloud_refinement as usedCloudRefinement,
          audio_path as audioPath,
          export_path as exportPath,
          error_message as errorMessage
        from sessions
        where id = ?`
      )
      .get(sessionId) as SessionRow | undefined;

    if (!session) {
      return null;
    }

    const segments = this.db
      .prepare(
        `select
          id,
          session_id as sessionId,
          start_ms as startMs,
          end_ms as endMs,
          text,
          confidence,
          source
        from segments
        where session_id = ?
        order by start_ms asc`
      )
      .all(sessionId) as TranscriptSegment[];

    return {
      ...this.normalizeSession(session),
      segments
    };
  }

  createSession(session: SessionRecord) {
    this.db
      .prepare(
        `insert into sessions (
          id,
          source_id,
          source_name,
          source_kind,
          source_app_name,
          status,
          started_at,
          ended_at,
          engine,
          used_cloud_refinement,
          audio_path,
          export_path,
          error_message
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        session.id,
        session.sourceId,
        session.sourceName,
        session.sourceKind,
        session.sourceAppName ?? null,
        session.status,
        session.startedAt,
        session.endedAt ?? null,
        session.engine,
        session.usedCloudRefinement ? 1 : 0,
        session.audioPath ?? null,
        session.exportPath ?? null,
        session.errorMessage ?? null
      );
  }

  updateSession(sessionId: string, patch: Partial<SessionRecord>) {
    const current = this.getSession(sessionId);
    if (!current) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    const next = { ...current, ...patch };
    this.db
      .prepare(
        `update sessions set
          source_id = ?,
          source_name = ?,
          source_kind = ?,
          source_app_name = ?,
          status = ?,
          started_at = ?,
          ended_at = ?,
          engine = ?,
          used_cloud_refinement = ?,
          audio_path = ?,
          export_path = ?,
          error_message = ?
        where id = ?`
      )
      .run(
        next.sourceId,
        next.sourceName,
        next.sourceKind,
        next.sourceAppName ?? null,
        next.status,
        next.startedAt,
        next.endedAt ?? null,
        next.engine,
        next.usedCloudRefinement ? 1 : 0,
        next.audioPath ?? null,
        next.exportPath ?? null,
        next.errorMessage ?? null,
        sessionId
      );
  }

  replaceSegments(sessionId: string, segments: TranscriptSegment[]) {
    const insert = this.db.prepare(
      `insert into segments (
        id,
        session_id,
        start_ms,
        end_ms,
        text,
        confidence,
        source
      ) values (?, ?, ?, ?, ?, ?, ?)`
    );

    const transaction = this.db.transaction(() => {
      this.db.prepare("delete from segments where session_id = ?").run(sessionId);

      for (const segment of segments) {
        insert.run(
          segment.id,
          segment.sessionId,
          segment.startMs,
          segment.endMs,
          segment.text,
          segment.confidence ?? null,
          segment.source
        );
      }
    });

    transaction();
  }

  private migrate() {
    this.db.exec(`
      create table if not exists sessions (
        id text primary key,
        source_id text not null,
        source_name text not null,
        source_kind text not null,
        source_app_name text,
        status text not null,
        started_at text not null,
        ended_at text,
        engine text not null,
        used_cloud_refinement integer not null default 0,
        audio_path text,
        export_path text,
        error_message text
      );

      create table if not exists segments (
        id text primary key,
        session_id text not null,
        start_ms integer not null,
        end_ms integer not null,
        text text not null,
        confidence real,
        source text not null,
        foreign key(session_id) references sessions(id) on delete cascade
      );
    `);
  }

  private normalizeSession(session: SessionRow): SessionRecord {
    const { usedCloudRefinement, ...rest } = session;

    return {
      ...rest,
      usedCloudRefinement: Boolean(usedCloudRefinement)
    };
  }
}
