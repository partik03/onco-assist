"""
Medical Report Processing Service for OncoAssist
Orchestrates the complete pipeline: email → PDF → analysis → TiDB → notifications
"""

import os
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

from .email_service import EmailService
from .pdf_parser import PDFParsingService
from .medical_analyzer import MedicalAnalyzerService
from .notification_service import NotificationService
from .services import OpenAIService
from .db import tidb

logger = logging.getLogger(__name__)

class MedicalReportProcessor:
    """Main service that orchestrates the complete medical report processing pipeline"""
    
    def __init__(self):
        self.email_service = EmailService()
        self.pdf_parser = PDFParsingService()
        self.medical_analyzer = MedicalAnalyzerService()
        self.notification_service = NotificationService()
        self.openai_service = OpenAIService()
        
        # Directories for file processing
        self.temp_dir = Path("./data/tmp")
        self.output_dir = Path("./data/outputs")
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def process_recent_emails(self, days: int = 3) -> Dict[str, Any]:
        """
        Process medical reports from recent emails
        
        Args:
            days: Number of days to look back for emails
            
        Returns:
            Processing summary with results
        """
        logger.info(f"Starting email processing for last {days} days")
        
        # Download attachments from emails
        attachment_paths = self.email_service.download_medical_attachments(
            days=days, 
            save_to=self.temp_dir
        )
        
        if not attachment_paths:
            logger.info("No medical attachments found")
            return {
                "status": "success",
                "message": "No new medical reports found",
                "processed_reports": 0,
                "attachments_downloaded": 0
            }
        
        logger.info(f"Downloaded {len(attachment_paths)} attachments")
        
        # Filter for PDF files
        pdf_paths = [Path(p) for p in attachment_paths if p.lower().endswith('.pdf')]
        
        if not pdf_paths:
            logger.info("No PDF files found in attachments")
            return {
                "status": "success",
                "message": "No PDF reports found",
                "processed_reports": 0,
                "attachments_downloaded": len(attachment_paths)
            }
        
        # Process all PDFs
        results = self.process_pdf_reports(pdf_paths)
        
        # Send notifications for critical findings
        self._send_notifications_for_results(results)
        
        return {
            "status": "success",
            "message": f"Processed {len(results)} medical reports",
            "processed_reports": len(results),
            "attachments_downloaded": len(attachment_paths),
            "results": results
        }
    
    def process_pdf_reports(self, pdf_paths: List[Path]) -> List[Dict[str, Any]]:
        """
        Process multiple PDF reports through the complete pipeline
        
        Args:
            pdf_paths: List of PDF file paths
            
        Returns:
            List of processing results
        """
        results = []
        
        for pdf_path in pdf_paths:
            try:
                result = self.process_single_pdf(pdf_path)
                results.append(result)
            except Exception as e:
                logger.error(f"Error processing {pdf_path}: {e}")
                results.append({
                    "source_file": str(pdf_path),
                    "status": "error",
                    "error": str(e),
                    "report_type": "unknown"
                })
        
        return results
    
    def process_single_pdf(self, pdf_path: Path) -> Dict[str, Any]:
        """
        Process a single PDF through the complete pipeline
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            Complete processing result
        """
        logger.info(f"Processing PDF: {pdf_path.name}")
        
        # Step 1: Parse PDF and extract structured data
        structured_data = self.pdf_parser.parse_pdf_to_structured_data(
            pdf_path, self.output_dir
        )
        
        report_type = structured_data["report_type"]
        patient_info = structured_data["patient"]
        
        # Step 2: Perform medical analysis based on report type
        analysis_result = {}
        if report_type != "unknown":
            try:
                analysis_result = self.medical_analyzer.analyze_report(
                    report_type, structured_data["text_content"]
                )
            except Exception as e:
                logger.error(f"Medical analysis failed: {e}")
                analysis_result = {"error": str(e)}
        
        # Step 3: Generate embeddings for vector search
        embedding = None
        try:
            # Create searchable text from key information
            searchable_text = self._create_searchable_text(structured_data, analysis_result)
            embedding = self.openai_service.embed(searchable_text)
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
        
        # Step 4: Store in TiDB
        document_id = None
        try:
            document_id = self._store_in_tidb(
                structured_data, analysis_result, embedding
            )
        except Exception as e:
            logger.error(f"TiDB storage failed: {e}")
        
        # Step 5: Prepare complete result
        result = {
            "document_id": document_id,
            "source_file": str(pdf_path),
            "report_type": report_type,
            "patient_info": patient_info,
            "structured_data": structured_data,
            "analysis_result": analysis_result,
            "status": "success",
            "processed_at": datetime.now().isoformat()
        }
        
        logger.info(f"Successfully processed {pdf_path.name} as {report_type}")
        return result
    
    def _create_searchable_text(
        self, 
        structured_data: Dict[str, Any], 
        analysis_result: Dict[str, Any]
    ) -> str:
        """Create comprehensive searchable text for embeddings"""
        text_parts = []
        
        # Patient information
        patient = structured_data.get("patient", {})
        if patient.get("name"):
            text_parts.append(f"Patient: {patient['name']}")
        
        # Report type and metadata
        report_type = structured_data.get("report_type", "")
        text_parts.append(f"Report type: {report_type}")
        
        # Key findings based on report type
        if report_type == "cbc":
            cbc = analysis_result
            text_parts.append(f"Blood test results:")
            if cbc.get("wbc"):
                text_parts.append(f"WBC: {cbc['wbc']}")
            if cbc.get("hemoglobin"):
                text_parts.append(f"Hemoglobin: {cbc['hemoglobin']}")
            if cbc.get("platelets"):
                text_parts.append(f"Platelets: {cbc['platelets']}")
            if cbc.get("flags"):
                text_parts.extend(cbc["flags"])
        
        elif report_type == "pet_ct":
            if "tnm_staging" in analysis_result:
                tnm = analysis_result["tnm_staging"]
                text_parts.append(f"TNM staging: {tnm.get('T', '')} {tnm.get('N', '')} {tnm.get('M', '')}")
                text_parts.append(f"Stage: {tnm.get('stage_group', '')}")
        
        elif report_type == "biopsy":
            if analysis_result.get("histology"):
                text_parts.append(f"Histology: {analysis_result['histology']}")
            if analysis_result.get("grade"):
                text_parts.append(f"Grade: {analysis_result['grade']}")
            
            # Hormone receptors
            er = analysis_result.get("er", {})
            pr = analysis_result.get("pr", {})
            if er.get("status"):
                text_parts.append(f"ER: {er['status']}")
            if pr.get("status"):
                text_parts.append(f"PR: {pr['status']}")
        
        # Patient summary for context
        if analysis_result.get("patient_summary"):
            text_parts.append(analysis_result["patient_summary"])
        
        # Original text content (truncated for performance)
        original_text = structured_data.get("text_content", "")
        if original_text:
            text_parts.append(original_text[:500])  # First 500 chars
        
        return " | ".join(text_parts)
    
    def _store_in_tidb(
        self, 
        structured_data: Dict[str, Any], 
        analysis_result: Dict[str, Any],
        embedding: Optional[List[float]] = None
    ) -> str:
        """Store processed report in TiDB"""
        conn = tidb.connection()
        
        # Generate document ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        patient_name = structured_data.get("patient", {}).get("name", "unknown")
        report_type = structured_data.get("report_type", "unknown")
        document_id = f"{report_type}_{patient_name}_{timestamp}".replace(" ", "_")
        
        # Prepare embedding for storage
        embedding_text = None
        if embedding:
            embedding_text = "[" + ",".join(str(x) for x in embedding) + "]"
        
        # Create searchable content
        searchable_content = self._create_searchable_text(structured_data, analysis_result)
        
        # Store in medical_documents table
        with conn.cursor() as cur:
            # Only store medical reports in TiDB, skip non-medical PDFs
            if report_type in ["cbc", "pet_ct", "biopsy"]:
                if embedding_text:
                    cur.execute(
                        """
                        INSERT INTO medical_documents 
                        (id, content, embedding, type, source, patient_name, patient_id, metadata, timestamp)
                        VALUES (%s, %s, VEC_FROM_TEXT(%s), %s, %s, %s, %s, %s, NOW())
                        ON DUPLICATE KEY UPDATE
                        content = VALUES(content),
                        embedding = VEC_FROM_TEXT(VALUES(embedding)),
                        metadata = VALUES(metadata),
                        timestamp = VALUES(timestamp)
                        """,
                        (
                            document_id,
                            searchable_content,
                            embedding_text,
                            report_type,
                            "email_pdf",
                            structured_data.get("patient", {}).get("name"),
                            structured_data.get("patient", {}).get("id"),
                            json.dumps({
                                "structured_data": structured_data,
                                "analysis_result": analysis_result,
                                "source_file": structured_data.get("source_file"),
                                "processed_at": datetime.now().isoformat()
                            }, ensure_ascii=False)
                        )
                    )
                    logger.info(f"Stored medical document in TiDB: {document_id}")
                else:
                    logger.warning(f"No embedding available for {document_id}")
            else:
                logger.info(f"Skipping non-medical document: {document_id} (type: {report_type})")
            
            # Store specific analysis data based on report type
            if report_type == "cbc" and analysis_result:
                # Store in patient_alerts if there are flags
                if analysis_result.get("flags"):
                    patient_phone = structured_data.get("patient", {}).get("contact", "")
                    for flag in analysis_result["flags"]:
                        cur.execute(
                            """
                            INSERT INTO patient_alerts 
                            (patient_phone, message, alert_type, severity, report_id)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (
                                patient_phone,
                                flag,
                                "blood_test",
                                "high" if "low" in flag.lower() else "medium",
                                document_id
                            )
                        )
        
        logger.info(f"Stored document in TiDB: {document_id}")
        return document_id
    
    def _send_notifications_for_results(self, results: List[Dict[str, Any]]):
        """Send notifications for critical findings"""
        for result in results:
            if result.get("status") != "success":
                continue
            
            report_type = result.get("report_type")
            analysis = result.get("analysis_result", {})
            patient_info = result.get("patient_info", {})
            
            # Send CBC alerts
            if report_type == "cbc" and analysis.get("flags"):
                try:
                    self.notification_service.send_cbc_alert(
                        cbc_data=analysis,
                        patient_info=patient_info,
                        contact_methods=['email', 'whatsapp']
                    )
                except Exception as e:
                    logger.error(f"Failed to send CBC alert: {e}")
            
            # Send WhatsApp/SMS summary only for medical reports
            try:
                if report_type in ["cbc", "pet_ct", "biopsy"]:
                    self.notification_service.send_report_summary(
                        report_data=result,
                        patient_info=patient_info,
                        attachment_paths=None  # No email attachments - WhatsApp/SMS only
                    )
            except Exception as e:
                logger.error(f"Failed to send report summary: {e}")
    
    def search_similar_cases(
        self, 
        query_text: str, 
        report_type: Optional[str] = None, 
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search for similar medical cases using vector similarity
        
        Args:
            query_text: Search query text
            report_type: Optional filter by report type
            limit: Maximum number of results
            
        Returns:
            List of similar cases with similarity scores
        """
        try:
            # Generate embedding for query
            query_embedding = self.openai_service.embed(query_text)
            embedding_text = "[" + ",".join(str(x) for x in query_embedding) + "]"
            
            # Build SQL query
            sql = """
                SELECT id, content, type, patient_name, timestamp, metadata,
                       VEC_COSINE_DISTANCE(embedding, VEC_FROM_TEXT(%s)) AS distance
                FROM medical_documents
                WHERE embedding IS NOT NULL
            """
            params = [embedding_text]
            
            if report_type:
                sql += " AND type = %s"
                params.append(report_type)
            
            sql += f" ORDER BY distance ASC LIMIT {int(limit)}"
            
            # Execute query
            conn = tidb.connection()
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
            
            # Process results
            results = []
            for row in rows:
                # Calculate similarity from distance
                similarity = 1 - float(row.get("distance", 1))
                
                # Parse metadata
                metadata = {}
                if row.get("metadata"):
                    try:
                        metadata = json.loads(row["metadata"])
                    except json.JSONDecodeError:
                        pass
                
                results.append({
                    "document_id": row["id"],
                    "content": row["content"],
                    "report_type": row["type"],
                    "patient_name": row["patient_name"],
                    "timestamp": row["timestamp"],
                    "similarity": similarity,
                    "metadata": metadata
                })
            
            return results
        
        except Exception as e:
            logger.error(f"Similar case search failed: {e}")
            return []
    
    def get_patient_history(self, patient_name: str) -> List[Dict[str, Any]]:
        """
        Get complete medical history for a patient
        
        Args:
            patient_name: Patient name to search for
            
        Returns:
            List of patient's medical documents
        """
        try:
            conn = tidb.connection()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, content, type, timestamp, metadata
                    FROM medical_documents
                    WHERE patient_name = %s
                    ORDER BY timestamp DESC
                    """,
                    (patient_name,)
                )
                rows = cur.fetchall()
            
            results = []
            for row in rows:
                metadata = {}
                if row.get("metadata"):
                    try:
                        metadata = json.loads(row["metadata"])
                    except json.JSONDecodeError:
                        pass
                
                results.append({
                    "document_id": row["id"],
                    "content": row["content"],
                    "report_type": row["type"],
                    "timestamp": row["timestamp"],
                    "metadata": metadata
                })
            
            return results
        
        except Exception as e:
            logger.error(f"Patient history search failed: {e}")
            return []
    
    def get_processing_summary(self) -> Dict[str, Any]:
        """Get summary of processed reports"""
        try:
            conn = tidb.connection()
            with conn.cursor() as cur:
                # Count by report type
                cur.execute(
                    """
                    SELECT type, COUNT(*) as count
                    FROM medical_documents
                    GROUP BY type
                    """
                )
                type_counts = {row["type"]: row["count"] for row in cur.fetchall()}
                
                # Recent activity
                cur.execute(
                    """
                    SELECT COUNT(*) as count
                    FROM medical_documents
                    WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    """
                )
                recent_count = cur.fetchone()["count"]
                
                # Total patients
                cur.execute(
                    """
                    SELECT COUNT(DISTINCT patient_name) as count
                    FROM medical_documents
                    WHERE patient_name IS NOT NULL
                    """
                )
                patient_count = cur.fetchone()["count"]
            
            return {
                "total_reports": sum(type_counts.values()),
                "reports_by_type": type_counts,
                "recent_reports_7_days": recent_count,
                "total_patients": patient_count,
                "last_updated": datetime.now().isoformat()
            }
        
        except Exception as e:
            logger.error(f"Failed to get processing summary: {e}")
            return {
                "error": str(e),
                "last_updated": datetime.now().isoformat()
            }
