from __future__ import annotations

import os
import pymysql
from typing import Optional, Any
import ssl
from dotenv import load_dotenv

# Ensure environment is loaded before reading variables
load_dotenv()


class TiDBConfig:
    def __init__(self) -> None:
        self.host: str = os.getenv("TIDB_HOST", "localhost")
        self.port: int = int(os.getenv("TIDB_PORT", "4000"))
        self.user: str = os.getenv("TIDB_USER", "root")
        self.password: str = os.getenv("TIDB_PASSWORD", "")
        self.database: str = os.getenv("TIDB_DATABASE", "onco_assist")
        self.ssl_ca_path: Optional[str] = os.getenv("TIDB_SSL_CA_PATH")


class TiDB:
    def __init__(self, config: Optional[TiDBConfig] = None) -> None:
        self.config = config or TiDBConfig()
        self._conn: Optional[pymysql.connections.Connection] = None

    def connect(self) -> None:
        if self._conn is not None:
            return
        connect_kwargs: dict[str, Any] = dict(
            host=self.config.host,
            port=self.config.port,
            user=self.config.user,
            password=self.config.password,
            database=self.config.database,
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor,
        )

        # Optional TLS
        if self.config.ssl_ca_path:
            ssl_ctx = ssl.create_default_context(cafile=self.config.ssl_ca_path)
            connect_kwargs["ssl"] = {"ssl": ssl_ctx}
        else:
            # If connecting to TiDB Cloud without a CA file, allow permissive TLS similar to mysql2's rejectUnauthorized: false
            if "tidbcloud.com" in (self.config.host or ""):
                # PyMySQL expects an ssl dict; use no verification
                connect_kwargs["ssl"] = {"cert_reqs": ssl.CERT_NONE}

        self._conn = pymysql.connect(**connect_kwargs)

    def connection(self) -> pymysql.connections.Connection:
        if self._conn is None:
            self.connect()
        assert self._conn is not None
        return self._conn

    def close(self) -> None:
        try:
            if self._conn is not None:
                self._conn.close()
        finally:
            self._conn = None

    def ping(self) -> bool:
        try:
            conn = self.connection()
            with conn.cursor() as cur:
                cur.execute("SELECT 1 AS ok")
                row: Optional[dict[str, Any]] = cur.fetchone()
                return bool(row and row.get("ok") == 1)
        except Exception:
            return False


# Singleton instance used by the app
tidb = TiDB()


