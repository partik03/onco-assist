"""
Enhanced Vector Database Service for OncoAssist
Provides advanced embedding generation, semantic search, and AI context management
"""

import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import numpy as np
from .services import OpenAIService
from .db import tidb

logger = logging.getLogger(__name__)

class VectorDatabaseService:
    """Enhanced vector database service with intelligent embedding and search capabilities"""
    
    def __init__(self):
        self.openai_service = OpenAIService()
        self.embedding_model = "text-embedding-3-small"  # Latest OpenAI embedding model
        self.vector_dimension = 1536  # Standard dimension for text-embedding-3-small
        
    def generate_medical_embedding(self, content: str, metadata: Dict[str, Any] = None) -> List[float]:
        """
        Generate enhanced medical embeddings with context
        
        Args:
            content: Medical text content
            metadata: Additional context (patient info, report type, etc.)
            
        Returns:
            Vector embedding as list of floats
        """
        try:
            # Enhance content with medical context for better embeddings
            enhanced_content = self._enhance_medical_content(content, metadata)
            
            if self.openai_service.is_configured():
                embedding = self.openai_service.client.embeddings.create(
                    model=self.embedding_model,
                    input=enhanced_content,
                    encoding_format="float"
                ).data[0].embedding
                
                logger.info(f"Generated embedding for medical content: {len(enhanced_content)} chars -> {len(embedding)} dimensions")
                return embedding
            else:
                # Generate deterministic fallback embedding
                return self._generate_fallback_embedding(enhanced_content)
                
        except Exception as e:
            logger.error(f"Error generating medical embedding: {e}")
            return self._generate_fallback_embedding(content)
    
    def _enhance_medical_content(self, content: str, metadata: Dict[str, Any] = None) -> str:
        """Enhance medical content with contextual information for better embeddings"""
        enhanced_parts = []
        
        # Add medical context prefix
        enhanced_parts.append("MEDICAL REPORT:")
        
        # Add report type context if available
        if metadata and "report_type" in metadata:
            report_type = metadata["report_type"]
            type_context = {
                "blood_test": "Blood Test Laboratory Report - CBC, Hematology, Chemistry",
                "cbc": "Complete Blood Count - White Blood Cells, Red Blood Cells, Platelets, Hemoglobin", 
                "pet_ct": "PET/CT Imaging - Oncology Scan, FDG Uptake, Tumor Detection, Staging",
                "biopsy": "Histopathology Biopsy - Tissue Analysis, Cancer Diagnosis, Grading",
                "radiology": "Medical Imaging - CT, MRI, X-ray, Ultrasound Findings",
                "pathology": "Pathology Report - Microscopic Analysis, Diagnosis, Staging"
            }
            if report_type in type_context:
                enhanced_parts.append(f"REPORT TYPE: {type_context[report_type]}")
        
        # Add patient context if available
        if metadata and "patient_name" in metadata and metadata["patient_name"]:
            enhanced_parts.append(f"PATIENT: {metadata['patient_name']}")
            
        # Add temporal context
        if metadata and "timestamp" in metadata:
            enhanced_parts.append(f"DATE: {metadata['timestamp']}")
            
        # Add the main content
        enhanced_parts.append(f"CONTENT: {content}")
        
        # Add medical keywords for better semantic understanding
        medical_keywords = self._extract_medical_keywords(content)
        if medical_keywords:
            enhanced_parts.append(f"MEDICAL TERMS: {', '.join(medical_keywords)}")
            
        return " | ".join(enhanced_parts)
    
    def _extract_medical_keywords(self, content: str) -> List[str]:
        """Extract relevant medical keywords from content"""
        content_lower = content.lower()
        
        # Comprehensive medical keyword dictionary
        medical_terms = {
            # Blood Test Terms
            "hemoglobin", "hgb", "wbc", "rbc", "platelets", "hematocrit", "mcv", "mch", "mchc",
            "neutrophils", "lymphocytes", "monocytes", "eosinophils", "basophils", "anc",
            
            # Cancer Terms  
            "tumor", "mass", "lesion", "neoplasm", "carcinoma", "adenocarcinoma", "sarcoma",
            "metastasis", "malignant", "benign", "oncology", "cancer", "staging", "grade",
            
            # Imaging Terms
            "ct", "mri", "pet", "scan", "imaging", "radiology", "fdg", "suvmax", "uptake",
            "contrast", "enhancement", "nodule", "opacity",
            
            # Pathology Terms
            "biopsy", "histopathology", "cytology", "ihc", "immunohistochemistry",
            "er", "pr", "her2", "ki67", "gleason", "nottingham", "grade",
            
            # Treatment Terms
            "chemotherapy", "radiation", "surgery", "treatment", "therapy", "protocol",
            "response", "remission", "progression", "stable",
            
            # Anatomy
            "breast", "lung", "prostate", "colon", "liver", "kidney", "brain", "bone",
            "lymph", "node", "abdomen", "pelvis", "chest", "thorax"
        }
        
        found_terms = []
        for term in medical_terms:
            if term in content_lower:
                found_terms.append(term)
                
        return found_terms[:10]  # Limit to top 10 terms
    
    def _generate_fallback_embedding(self, content: str) -> List[float]:
        """Generate deterministic fallback embedding when OpenAI is not available"""
        # Use hash-based approach for consistent fallback embeddings
        import hashlib
        
        # Create hash of content
        content_hash = hashlib.md5(content.encode()).hexdigest()
        
        # Generate pseudo-random but deterministic embedding
        np.random.seed(int(content_hash[:8], 16))
        embedding = np.random.normal(0, 0.1, self.vector_dimension).tolist()
        
        logger.warning("Using fallback embedding generation (OpenAI not configured)")
        return embedding
    
    def store_medical_document_with_embedding(
        self, 
        document_id: str,
        content: str,
        report_type: str,
        patient_name: str = None,
        patient_id: str = None,
        source: str = "unknown",
        metadata: Dict[str, Any] = None
    ) -> bool:
        """
        Store medical document with enhanced embedding in TiDB
        
        Args:
            document_id: Unique document identifier
            content: Medical report content
            report_type: Type of medical report (cbc, pet_ct, biopsy, etc.)
            patient_name: Patient name
            patient_id: Patient ID
            source: Document source
            metadata: Additional metadata
            
        Returns:
            Success status
        """
        try:
            # Prepare metadata for embedding
            embedding_metadata = {
                "report_type": report_type,
                "patient_name": patient_name,
                "patient_id": patient_id,
                "source": source,
                "timestamp": datetime.now().isoformat()
            }
            if metadata:
                embedding_metadata.update(metadata)
            
            # Generate enhanced embedding
            embedding = self.generate_medical_embedding(content, embedding_metadata)
            embedding_text = "[" + ",".join(str(x) for x in embedding) + "]"
            
            # Store in TiDB
            conn = tidb.connection()
            with conn.cursor() as cur:
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
                        content,
                        embedding_text,
                        report_type,
                        source,
                        patient_name,
                        patient_id,
                        json.dumps(embedding_metadata, ensure_ascii=False)
                    )
                )
                conn.commit()
                logger.info(f"Stored medical document with enhanced embedding: {document_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error storing medical document with embedding: {e}")
            return False
    
    def semantic_search(
        self, 
        query: str, 
        limit: int = 10,
        patient_filter: str = None,
        report_type_filter: str = None,
        similarity_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search using vector similarity
        
        Args:
            query: Search query
            limit: Maximum number of results
            patient_filter: Filter by patient name
            report_type_filter: Filter by report type
            similarity_threshold: Minimum similarity score
            
        Returns:
            List of similar documents with similarity scores
        """
        try:
            # Generate query embedding
            query_metadata = {
                "query_type": "search",
                "report_type": report_type_filter
            }
            query_embedding = self.generate_medical_embedding(query, query_metadata)
            query_embedding_text = "[" + ",".join(str(x) for x in query_embedding) + "]"
            
            # Build SQL query with filters
            sql_conditions = []
            sql_params = [query_embedding_text, limit]
            
            if patient_filter:
                sql_conditions.append("patient_name LIKE %s")
                sql_params.insert(-1, f"%{patient_filter}%")
                
            if report_type_filter:
                sql_conditions.append("type = %s") 
                sql_params.insert(-1, report_type_filter)
            
            where_clause = f"WHERE {' AND '.join(sql_conditions)}" if sql_conditions else ""
            
            conn = tidb.connection()
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT 
                        id, content, type, patient_name, patient_id, source, timestamp,
                        VEC_COSINE_DISTANCE(embedding, VEC_FROM_TEXT(%s)) AS similarity_score
                    FROM medical_documents 
                    {where_clause}
                    ORDER BY similarity_score ASC
                    LIMIT %s
                    """,
                    sql_params
                )
                
                results = []
                for row in cur.fetchall():
                    # Convert distance to similarity (1 - distance)
                    similarity = 1 - float(row['similarity_score'])
                    
                    if similarity >= similarity_threshold:
                        results.append({
                            "id": row['id'],
                            "content": row['content'],
                            "type": row['type'],
                            "patient_name": row['patient_name'],
                            "patient_id": row['patient_id'],
                            "source": row['source'],
                            "timestamp": row['timestamp'],
                            "similarity": round(similarity, 4)
                        })
                
                logger.info(f"Found {len(results)} similar documents for query: {query[:50]}...")
                return results
                
        except Exception as e:
            logger.error(f"Error in semantic search: {e}")
            return []
    
    def get_patient_medical_timeline(
        self, 
        patient_name: str,
        days_back: int = 365
    ) -> List[Dict[str, Any]]:
        """
        Get chronological medical timeline for a patient
        
        Args:
            patient_name: Patient name
            days_back: Number of days to look back
            
        Returns:
            Chronologically ordered medical documents
        """
        try:
            cutoff_date = datetime.now() - timedelta(days=days_back)
            
            conn = tidb.connection()
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, content, type, source, timestamp, metadata
                    FROM medical_documents 
                    WHERE patient_name = %s AND timestamp >= %s
                    ORDER BY timestamp DESC
                    """,
                    (patient_name, cutoff_date)
                )
                
                timeline = []
                for row in cur.fetchall():
                    timeline.append({
                        "id": row['id'],
                        "content": row['content'],
                        "type": row['type'],
                        "source": row['source'],
                        "timestamp": row['timestamp'],
                        "metadata": json.loads(row['metadata']) if row['metadata'] else {}
                    })
                
                logger.info(f"Retrieved {len(timeline)} documents for patient {patient_name}")
                return timeline
                
        except Exception as e:
            logger.error(f"Error getting patient timeline: {e}")
            return []
    
    def find_similar_cases(
        self, 
        patient_name: str,
        report_type: str = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find similar cases to a given patient
        
        Args:
            patient_name: Patient to find similar cases for
            report_type: Optional report type filter
            limit: Maximum number of similar cases
            
        Returns:
            List of similar patient cases
        """
        try:
            # Get patient's latest reports
            patient_timeline = self.get_patient_medical_timeline(patient_name, days_back=90)
            
            if not patient_timeline:
                return []
            
            # Use most recent report as reference
            reference_report = patient_timeline[0]
            query_text = reference_report['content']
            
            # Search for similar cases (excluding same patient)
            results = self.semantic_search(
                query=query_text,
                limit=limit * 2,  # Get more to filter out same patient
                report_type_filter=report_type
            )
            
            # Filter out same patient and return top matches
            similar_cases = []
            for result in results:
                if result['patient_name'] != patient_name and len(similar_cases) < limit:
                    similar_cases.append(result)
            
            logger.info(f"Found {len(similar_cases)} similar cases for patient {patient_name}")
            return similar_cases
            
        except Exception as e:
            logger.error(f"Error finding similar cases: {e}")
            return []
    
    def get_ai_medical_context(
        self, 
        patient_name: str = None,
        report_types: List[str] = None,
        days_back: int = 180
    ) -> Dict[str, Any]:
        """
        Generate comprehensive AI context for medical decision making
        
        Args:
            patient_name: Optional patient filter
            report_types: Optional report type filters
            days_back: Days to look back for context
            
        Returns:
            Structured medical context for AI
        """
        try:
            context = {
                "patient_summary": {},
                "recent_trends": {},
                "similar_cases": [],
                "medical_insights": [],
                "data_sources": []
            }
            
            if patient_name:
                # Get patient timeline
                timeline = self.get_patient_medical_timeline(patient_name, days_back)
                
                # Analyze trends
                context["patient_summary"] = self._analyze_patient_trends(timeline)
                
                # Find similar cases  
                context["similar_cases"] = self.find_similar_cases(patient_name)
                
            else:
                # Get recent system-wide trends
                context["recent_trends"] = self._get_system_trends(days_back)
            
            # Generate medical insights
            context["medical_insights"] = self._generate_medical_insights(context)
            
            return context
            
        except Exception as e:
            logger.error(f"Error generating AI medical context: {e}")
            return {"error": str(e)}
    
    def _analyze_patient_trends(self, timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze patient medical trends from timeline"""
        if not timeline:
            return {}
            
        trends = {
            "total_reports": len(timeline),
            "report_types": {},
            "latest_report": timeline[0] if timeline else None,
            "timeline_span_days": 0
        }
        
        # Count report types
        for report in timeline:
            report_type = report['type']
            trends["report_types"][report_type] = trends["report_types"].get(report_type, 0) + 1
        
        # Calculate timeline span
        if len(timeline) > 1:
            latest = datetime.fromisoformat(timeline[0]['timestamp'].replace('Z', '+00:00'))
            earliest = datetime.fromisoformat(timeline[-1]['timestamp'].replace('Z', '+00:00'))
            trends["timeline_span_days"] = (latest - earliest).days
            
        return trends
    
    def _get_system_trends(self, days_back: int) -> Dict[str, Any]:
        """Get system-wide medical data trends"""
        try:
            cutoff_date = datetime.now() - timedelta(days=days_back)
            
            conn = tidb.connection()
            with conn.cursor() as cur:
                # Get report type distribution
                cur.execute(
                    """
                    SELECT type, COUNT(*) as count
                    FROM medical_documents 
                    WHERE timestamp >= %s
                    GROUP BY type
                    """,
                    (cutoff_date,)
                )
                
                report_distribution = {row['type']: row['count'] for row in cur.fetchall()}
                
                return {
                    "report_distribution": report_distribution,
                    "total_documents": sum(report_distribution.values()),
                    "analysis_period_days": days_back
                }
                
        except Exception as e:
            logger.error(f"Error getting system trends: {e}")
            return {}
    
    def _generate_medical_insights(self, context: Dict[str, Any]) -> List[str]:
        """Generate medical insights from context"""
        insights = []
        
        # Patient-specific insights
        if "patient_summary" in context and context["patient_summary"]:
            summary = context["patient_summary"]
            
            if summary.get("total_reports", 0) > 5:
                insights.append(f"Patient has extensive medical history with {summary['total_reports']} reports")
                
            if "blood_test" in summary.get("report_types", {}):
                insights.append("Blood test monitoring indicates active treatment tracking")
                
            if len(summary.get("report_types", {})) > 2:
                insights.append("Multi-modal monitoring suggests comprehensive care approach")
        
        # Similar cases insights
        if context.get("similar_cases"):
            insights.append(f"Found {len(context['similar_cases'])} similar patient cases for comparison")
            
        return insights

# Singleton instance
vector_service = VectorDatabaseService()
