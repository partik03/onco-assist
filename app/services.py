from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google.auth.transport.requests import Request
from twilio.rest import Client as TwilioClient
from openai import OpenAI


class GoogleService:
    def __init__(self) -> None:
        self.client_id = os.getenv("GOOGLE_CLIENT_ID", "")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
        self.refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN", "")
        self.access_token = os.getenv("GOOGLE_ACCESS_TOKEN", "")
        self._docs = None
        self._sheets = None
        self._drive = None
        if self.client_id and self.client_secret and self.refresh_token:
            creds = Credentials(
                token=self.access_token or None,
                refresh_token=self.refresh_token,
                client_id=self.client_id,
                client_secret=self.client_secret,
                token_uri="https://oauth2.googleapis.com/token",
            )
            if not creds.valid and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            self._docs = build("docs", "v1", credentials=creds)
            self._sheets = build("sheets", "v4", credentials=creds)
            self._drive = build("drive", "v3", credentials=creds)

    def is_configured(self) -> bool:
        return bool(self._docs and self._drive and self._sheets)

    def create_document(self, title: str, folder_id: str | None = None) -> str:
        doc = self._docs.documents().create(body={"title": title}).execute()
        document_id = doc.get("documentId")
        if folder_id:
            self._drive.files().update(fileId=document_id, addParents=folder_id, removeParents="root").execute()
        return document_id

    def update_document(self, document_id: str, content: str) -> None:
        self._docs.documents().batchUpdate(
            documentId=document_id,
            body={
                "requests": [
                    {"insertText": {"location": {"index": 1}, "text": content}}
                ]
            },
        ).execute()


class GmailService:
    def __init__(self) -> None:
        self.client_id = os.getenv("GOOGLE_CLIENT_ID", "")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
        self.refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN", "")
        self.access_token = os.getenv("GOOGLE_ACCESS_TOKEN", "")
        self._gmail = None
        if self.client_id and self.client_secret and self.refresh_token:
            creds = Credentials(
                token=self.access_token or None,
                refresh_token=self.refresh_token,
                client_id=self.client_id,
                client_secret=self.client_secret,
                token_uri="https://oauth2.googleapis.com/token",
            )
            if not creds.valid and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            self._gmail = build("gmail", "v1", credentials=creds)

    def is_configured(self) -> bool:
        return bool(self._gmail)

    def get_unread(self, max_results: int = 10) -> List[Dict[str, Any]]:
        res = self._gmail.users().messages().list(userId="me", q="is:unread", maxResults=max_results).execute()
        return res.get("messages", [])
    
    def get_recent_with_attachments(self, days: int = 3, max_results: int = 50) -> List[Dict[str, Any]]:
        """Get recent emails with attachments"""
        from datetime import datetime, timedelta
        
        # Calculate date for Gmail search
        since_date = (datetime.now() - timedelta(days=days)).strftime('%Y/%m/%d')
        query = f"has:attachment after:{since_date}"
        
        res = self._gmail.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
        return res.get("messages", [])

    def get_message(self, message_id: str) -> Dict[str, Any]:
        msg = self._gmail.users().messages().get(userId="me", id=message_id).execute()
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        
        # Check if message has attachments
        has_attachments = False
        payload = msg.get("payload", {})
        if payload.get("parts"):
            for part in payload["parts"]:
                if part.get("filename"):
                    has_attachments = True
                    break
                elif part.get("parts"):  # Check nested parts
                    for nested_part in part["parts"]:
                        if nested_part.get("filename"):
                            has_attachments = True
                            break
        
        return {
            "id": message_id,
            "subject": headers.get("Subject", ""),
            "from": headers.get("From", ""),
            "date": headers.get("Date", ""),
            "snippet": msg.get("snippet", ""),
            "threadId": msg.get("threadId", ""),
            "labelIds": msg.get("labelIds", []),
            "attachments": has_attachments,
        }
    
    def get_attachments(self, message_id: str) -> List[Dict[str, Any]]:
        """Get attachments from a Gmail message"""
        if not self._gmail:
            return []
        
        try:
            msg = self._gmail.users().messages().get(userId="me", id=message_id).execute()
            attachments = []
            
            def extract_attachments(parts):
                for part in parts:
                    if part.get('parts'):
                        extract_attachments(part['parts'])
                    elif part.get('filename'):
                        attachment_id = part['body'].get('attachmentId')
                        if attachment_id:
                            # Get attachment data
                            att = self._gmail.users().messages().attachments().get(
                                userId="me", messageId=message_id, id=attachment_id
                            ).execute()
                            
                            import base64
                            data = base64.urlsafe_b64decode(att['data'])
                            
                            attachments.append({
                                'filename': part['filename'],
                                'data': data,
                                'mimeType': part.get('mimeType', ''),
                                'size': att.get('size', 0)
                            })
            
            payload = msg.get('payload', {})
            if payload.get('parts'):
                extract_attachments(payload['parts'])
            
            return attachments
            
        except Exception as e:
            print(f"Error getting attachments: {e}")
            return []
    
# Email sending removed - focus on reading emails for data aggregation


class TwilioService:
    def __init__(self) -> None:
        self.account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        self.auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        self.from_number = os.getenv("TWILIO_FROM_NUMBER", "")
        self._client: Optional[TwilioClient] = None
        if self.account_sid and self.auth_token and self.account_sid.startswith("AC"):
            self._client = TwilioClient(self.account_sid, self.auth_token)

    def is_configured(self) -> bool:
        return bool(self._client)

    def send_sms(self, to: str, body: str) -> str:
        if not self._client:
            return f"mock_sms_{os.getpid()}"
        msg = self._client.messages.create(body=body, from_=self.from_number, to=to)
        return msg.sid

    def send_whatsapp(self, to: str, body: str) -> str:
        if not self._client:
            return f"mock_whatsapp_{os.getpid()}"
        msg = self._client.messages.create(body=body, from_=f"whatsapp:{self.from_number}", to=f"whatsapp:{to}")
        return msg.sid


class OpenAIService:
    def __init__(self) -> None:
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o")
        # Delay client creation to avoid env/proxy issues; default to mock
        self._client: Optional[OpenAI] = None

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _mock_embedding(self, text: str, dim: int = 1536) -> List[float]:
        # Deterministic pseudo-embedding based on token hashes
        import math, hashlib
        vec = [0.0] * dim
        tokens = (text or "").lower().split()
        if not tokens:
            return vec
        for tok in tokens:
            h = int(hashlib.sha256(tok.encode("utf-8")).hexdigest(), 16)
            idx = h % dim
            val = ((h >> 8) % 1000) / 1000.0  # 0..0.999
            vec[idx] = (vec[idx] + val) % 1.0
        # L2 normalize
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed(self, text: str, model: str = "text-embedding-3-small") -> List[float]:
        # For now, use deterministic mock to avoid client/env issues.
        return self._mock_embedding(text)


