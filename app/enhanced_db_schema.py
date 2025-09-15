"""
Enhanced TiDB Schema for OncoAssist
Optimized for AI context, vector search, and comprehensive medical data management
"""

import logging
from typing import Dict, Any
from .db import tidb

logger = logging.getLogger(__name__)

class EnhancedMedicalSchema:
    """Enhanced database schema for comprehensive medical data management"""
    
    def __init__(self):
        self.conn = tidb.connection()
    
    def initialize_enhanced_schema(self) -> bool:
        """Initialize enhanced medical database schema"""
        try:
            with self.conn.cursor() as cur:
                # 1. Enhanced Patients Table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS patients_enhanced (
                        id VARCHAR(50) PRIMARY KEY,
                        name VARCHAR(200) NOT NULL,
                        date_of_birth DATE,
                        gender ENUM('Male', 'Female', 'Other'),
                        contact_phone VARCHAR(20),
                        contact_email VARCHAR(100),
                        emergency_contact JSON,
                        medical_record_number VARCHAR(50) UNIQUE,
                        primary_oncologist VARCHAR(100),
                        cancer_type VARCHAR(100),
                        cancer_stage VARCHAR(20),
                        diagnosis_date DATE,
                        treatment_status ENUM('Active', 'Remission', 'Surveillance', 'Palliative'),
                        risk_factors JSON,
                        allergies JSON,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_name (name),
                        INDEX idx_cancer_type (cancer_type),
                        INDEX idx_treatment_status (treatment_status)
                    )
                """)
                
                # 2. Enhanced Medical Documents with Vector Search
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS medical_documents_enhanced (
                        id VARCHAR(100) PRIMARY KEY,
                        patient_id VARCHAR(50),
                        content TEXT NOT NULL,
                        embedding VECTOR(1536) COMMENT 'OpenAI text-embedding-3-small',
                        document_type ENUM('cbc', 'chemistry', 'tumor_markers', 'pet_ct', 'ct', 'mri', 
                                          'biopsy', 'pathology', 'radiology', 'prescription', 'clinical_notes') NOT NULL,
                        document_subtype VARCHAR(50),
                        source VARCHAR(100),
                        facility_name VARCHAR(200),
                        ordering_physician VARCHAR(100),
                        report_date DATE,
                        received_date DATE,
                        status ENUM('Preliminary', 'Final', 'Amended', 'Corrected') DEFAULT 'Final',
                        priority ENUM('Routine', 'Urgent', 'STAT') DEFAULT 'Routine',
                        structured_data JSON,
                        raw_text TEXT,
                        file_path VARCHAR(500),
                        file_type VARCHAR(20),
                        keywords TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES patients_enhanced(id) ON DELETE CASCADE,
                        INDEX idx_patient_id (patient_id),
                        INDEX idx_document_type (document_type),
                        INDEX idx_report_date (report_date),
                        INDEX idx_keywords (keywords(100))
                    )
                """)
                
                # 3. Blood Test Results Table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS blood_test_results (
                        id VARCHAR(100) PRIMARY KEY,
                        patient_id VARCHAR(50) NOT NULL,
                        document_id VARCHAR(100),
                        test_date DATE NOT NULL,
                        test_type ENUM('CBC', 'Chemistry', 'Tumor_Markers', 'Coagulation', 'Thyroid', 'Liver', 'Kidney') NOT NULL,
                        
                        -- CBC Values
                        hemoglobin DECIMAL(5,2),
                        hematocrit DECIMAL(5,2),
                        wbc DECIMAL(8,2),
                        rbc DECIMAL(6,2),
                        platelets INTEGER,
                        mcv DECIMAL(5,2),
                        mch DECIMAL(5,2),
                        mchc DECIMAL(5,2),
                        neutrophils_percent DECIMAL(5,2),
                        lymphocytes_percent DECIMAL(5,2),
                        monocytes_percent DECIMAL(5,2),
                        eosinophils_percent DECIMAL(5,2),
                        basophils_percent DECIMAL(5,2),
                        anc INTEGER,
                        
                        -- Chemistry Values
                        glucose DECIMAL(6,2),
                        creatinine DECIMAL(5,2),
                        bun DECIMAL(5,2),
                        sodium DECIMAL(5,2),
                        potassium DECIMAL(5,2),
                        chloride DECIMAL(5,2),
                        co2 DECIMAL(5,2),
                        albumin DECIMAL(5,2),
                        total_protein DECIMAL(5,2),
                        alt DECIMAL(6,2),
                        ast DECIMAL(6,2),
                        alkaline_phosphatase DECIMAL(6,2),
                        total_bilirubin DECIMAL(5,2),
                        
                        -- Tumor Markers
                        cea DECIMAL(8,2),
                        ca_125 DECIMAL(8,2),
                        ca_15_3 DECIMAL(8,2),
                        ca_19_9 DECIMAL(8,2),
                        psa DECIMAL(8,2),
                        afp DECIMAL(8,2),
                        
                        -- Flags and Notes
                        critical_values JSON,
                        abnormal_flags JSON,
                        reference_ranges JSON,
                        lab_comments TEXT,
                        
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES patients_enhanced(id) ON DELETE CASCADE,
                        FOREIGN KEY (document_id) REFERENCES medical_documents_enhanced(id),
                        INDEX idx_patient_test_date (patient_id, test_date),
                        INDEX idx_test_type (test_type),
                        INDEX idx_critical_values (critical_values((100)))
                    )
                """)
                
                # 4. Imaging Results Table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS imaging_results (
                        id VARCHAR(100) PRIMARY KEY,
                        patient_id VARCHAR(50) NOT NULL,
                        document_id VARCHAR(100),
                        exam_date DATE NOT NULL,
                        modality ENUM('CT', 'MRI', 'PET', 'PET_CT', 'Ultrasound', 'X-ray', 'Mammography') NOT NULL,
                        body_region VARCHAR(100),
                        contrast_used BOOLEAN DEFAULT FALSE,
                        indication TEXT,
                        
                        -- Key Findings
                        primary_findings JSON,
                        measurements JSON,
                        lesion_details JSON,
                        
                        -- Structured Results
                        tumor_size_cm DECIMAL(6,2),
                        tumor_location VARCHAR(200),
                        suvmax DECIMAL(5,2),
                        lymph_nodes JSON,
                        metastases JSON,
                        response_assessment ENUM('Complete_Response', 'Partial_Response', 'Stable_Disease', 'Progressive_Disease'),
                        
                        -- RECIST/PERCIST
                        target_lesions JSON,
                        non_target_lesions JSON,
                        new_lesions BOOLEAN DEFAULT FALSE,
                        
                        impression TEXT,
                        recommendations TEXT,
                        comparison_notes TEXT,
                        radiologist VARCHAR(100),
                        
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES patients_enhanced(id) ON DELETE CASCADE,
                        FOREIGN KEY (document_id) REFERENCES medical_documents_enhanced(id),
                        INDEX idx_patient_exam_date (patient_id, exam_date),
                        INDEX idx_modality (modality),
                        INDEX idx_response_assessment (response_assessment)
                    )
                """)
                
                # 5. Pathology Results Table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS pathology_results (
                        id VARCHAR(100) PRIMARY KEY,
                        patient_id VARCHAR(50) NOT NULL,
                        document_id VARCHAR(100),
                        procedure_date DATE NOT NULL,
                        procedure_type ENUM('Biopsy', 'Surgical_Resection', 'Cytology', 'Flow_Cytometry') NOT NULL,
                        specimen_site VARCHAR(200),
                        specimen_type VARCHAR(100),
                        
                        -- Diagnosis
                        primary_diagnosis VARCHAR(500),
                        histologic_type VARCHAR(200),
                        histologic_grade VARCHAR(50),
                        tumor_stage VARCHAR(20),
                        
                        -- Molecular Markers
                        er_status ENUM('Positive', 'Negative', 'Indeterminate'),
                        pr_status ENUM('Positive', 'Negative', 'Indeterminate'),
                        her2_status ENUM('Positive', 'Negative', 'Equivocal'),
                        ki67_percent DECIMAL(5,2),
                        
                        -- Additional Markers
                        molecular_markers JSON,
                        immunohistochemistry JSON,
                        genetic_alterations JSON,
                        
                        -- Margins and Invasion
                        margins_status ENUM('Negative', 'Positive', 'Close'),
                        lymphovascular_invasion BOOLEAN,
                        perineural_invasion BOOLEAN,
                        
                        pathologist VARCHAR(100),
                        comments TEXT,
                        
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES patients_enhanced(id) ON DELETE CASCADE,
                        FOREIGN KEY (document_id) REFERENCES medical_documents_enhanced(id),
                        INDEX idx_patient_procedure_date (patient_id, procedure_date),
                        INDEX idx_histologic_type (histologic_type),
                        INDEX idx_molecular_markers (molecular_markers((200)))
                    )
                """)
                
                # 6. Treatment Plans Table
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS treatment_plans (
                        id VARCHAR(100) PRIMARY KEY,
                        patient_id VARCHAR(50) NOT NULL,
                        plan_name VARCHAR(200),
                        treatment_type ENUM('Chemotherapy', 'Radiation', 'Surgery', 'Immunotherapy', 
                                          'Targeted_Therapy', 'Combination') NOT NULL,
                        start_date DATE,
                        end_date DATE,
                        status ENUM('Planned', 'Active', 'Completed', 'Discontinued', 'On_Hold') DEFAULT 'Planned',
                        
                        -- Treatment Details
                        regimen_name VARCHAR(200),
                        cycle_length_days INTEGER,
                        total_cycles INTEGER,
                        completed_cycles INTEGER DEFAULT 0,
                        
                        medications JSON,
                        dosing_schedule JSON,
                        side_effects JSON,
                        response_data JSON,
                        
                        oncologist VARCHAR(100),
                        facility VARCHAR(200),
                        notes TEXT,
                        
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (patient_id) REFERENCES patients_enhanced(id) ON DELETE CASCADE,
                        INDEX idx_patient_treatment (patient_id, treatment_type),
                        INDEX idx_status (status)
                    )
                """)
                
                # 7. Medical Alerts and Notifications
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS medical_alerts (
                        id VARCHAR(100) PRIMARY KEY,
                        patient_id VARCHAR(50) NOT NULL,
                        alert_type ENUM('Critical_Lab', 'Imaging_Finding', 'Medication_Alert', 
                                       'Appointment_Reminder', 'Treatment_Response', 'Side_Effect') NOT NULL,
                        severity ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL,
                        title VARCHAR(200) NOT NULL,
                        message TEXT NOT NULL,
                        
                        -- Alert Context
                        source_document_id VARCHAR(100),
                        triggered_by JSON,
                        alert_data JSON,
                        
                        -- Status and Actions
                        status ENUM('Active', 'Acknowledged', 'Resolved', 'Dismissed') DEFAULT 'Active',
                        acknowledged_by VARCHAR(100),
                        acknowledged_at TIMESTAMP NULL,
                        resolved_at TIMESTAMP NULL,
                        
                        -- Notifications
                        notification_methods JSON,
                        notification_sent BOOLEAN DEFAULT FALSE,
                        notification_sent_at TIMESTAMP NULL,
                        
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        expires_at TIMESTAMP NULL,
                        
                        FOREIGN KEY (patient_id) REFERENCES patients_enhanced(id) ON DELETE CASCADE,
                        FOREIGN KEY (source_document_id) REFERENCES medical_documents_enhanced(id),
                        INDEX idx_patient_alerts (patient_id, status),
                        INDEX idx_severity (severity),
                        INDEX idx_alert_type (alert_type),
                        INDEX idx_expires_at (expires_at)
                    )
                """)
                
                # 8. Create Vector Index for Enhanced Documents
                cur.execute("""
                    CREATE VECTOR INDEX IF NOT EXISTS idx_enhanced_embedding 
                    ON medical_documents_enhanced (embedding) 
                    WITH (metric_type = 'cosine', dimension = 1536)
                """)
                
                self.conn.commit()
                logger.info("Enhanced medical schema initialized successfully")
                return True
                
        except Exception as e:
            logger.error(f"Error initializing enhanced schema: {e}")
            self.conn.rollback()
            return False
    
    def create_sample_enhanced_data(self) -> bool:
        """Create comprehensive sample data for testing"""
        try:
            with self.conn.cursor() as cur:
                # Sample Enhanced Patients
                enhanced_patients = [
                    {
                        'id': 'patient_001_enhanced',
                        'name': 'Sarah Chen',
                        'date_of_birth': '1975-03-15',
                        'gender': 'Female',
                        'contact_phone': '+1-555-0101',
                        'contact_email': 'sarah.chen@email.com',
                        'emergency_contact': '{"name": "David Chen", "phone": "+1-555-0102", "relation": "Spouse"}',
                        'medical_record_number': 'MRN001ENH',
                        'primary_oncologist': 'Dr. Maria Rodriguez',
                        'cancer_type': 'Breast Cancer',
                        'cancer_stage': 'Stage IIA',
                        'diagnosis_date': '2024-01-15',
                        'treatment_status': 'Active',
                        'risk_factors': '["Family_History", "BRCA1_Positive"]',
                        'allergies': '["Penicillin", "Contrast_Dye"]'
                    },
                    {
                        'id': 'patient_002_enhanced', 
                        'name': 'Michael Thompson',
                        'date_of_birth': '1968-07-22',
                        'gender': 'Male',
                        'contact_phone': '+1-555-0201',
                        'contact_email': 'michael.t@email.com',
                        'emergency_contact': '{"name": "Lisa Thompson", "phone": "+1-555-0202", "relation": "Wife"}',
                        'medical_record_number': 'MRN002ENH',
                        'primary_oncologist': 'Dr. James Wilson',
                        'cancer_type': 'Prostate Cancer',
                        'cancer_stage': 'Stage II',
                        'diagnosis_date': '2023-11-08',
                        'treatment_status': 'Surveillance',
                        'risk_factors': '["Age", "Family_History"]',
                        'allergies': '[]'
                    }
                ]
                
                for patient in enhanced_patients:
                    cur.execute(
                        """
                        INSERT IGNORE INTO patients_enhanced 
                        (id, name, date_of_birth, gender, contact_phone, contact_email, 
                         emergency_contact, medical_record_number, primary_oncologist, 
                         cancer_type, cancer_stage, diagnosis_date, treatment_status, 
                         risk_factors, allergies)
                        VALUES (%(id)s, %(name)s, %(date_of_birth)s, %(gender)s, 
                               %(contact_phone)s, %(contact_email)s, %(emergency_contact)s,
                               %(medical_record_number)s, %(primary_oncologist)s, 
                               %(cancer_type)s, %(cancer_stage)s, %(diagnosis_date)s,
                               %(treatment_status)s, %(risk_factors)s, %(allergies)s)
                        """,
                        patient
                    )
                
                # Sample Blood Test Results
                blood_tests = [
                    {
                        'id': 'cbc_001_enh',
                        'patient_id': 'patient_001_enhanced',
                        'test_date': '2024-09-10',
                        'test_type': 'CBC',
                        'hemoglobin': 11.5,
                        'hematocrit': 34.2,
                        'wbc': 3.8,
                        'rbc': 4.1,
                        'platelets': 180,
                        'neutrophils_percent': 65.0,
                        'lymphocytes_percent': 25.0,
                        'anc': 2470,
                        'critical_values': '{"wbc": "Low", "hemoglobin": "Low"}',
                        'abnormal_flags': '["Low_WBC", "Low_Hemoglobin"]',
                        'lab_comments': 'Consistent with chemotherapy effects. Monitor closely.'
                    },
                    {
                        'id': 'markers_001_enh',
                        'patient_id': 'patient_001_enhanced', 
                        'test_date': '2024-09-10',
                        'test_type': 'Tumor_Markers',
                        'cea': 2.1,
                        'ca_15_3': 28.5,
                        'ca_125': 15.2,
                        'critical_values': '{}',
                        'abnormal_flags': '[]',
                        'lab_comments': 'Tumor markers within normal limits.'
                    }
                ]
                
                for test in blood_tests:
                    cur.execute(
                        """
                        INSERT IGNORE INTO blood_test_results 
                        (id, patient_id, test_date, test_type, hemoglobin, hematocrit, 
                         wbc, rbc, platelets, neutrophils_percent, lymphocytes_percent, 
                         anc, cea, ca_15_3, ca_125, critical_values, abnormal_flags, lab_comments)
                        VALUES (%(id)s, %(patient_id)s, %(test_date)s, %(test_type)s,
                               %(hemoglobin)s, %(hematocrit)s, %(wbc)s, %(rbc)s, 
                               %(platelets)s, %(neutrophils_percent)s, %(lymphocytes_percent)s,
                               %(anc)s, %(cea)s, %(ca_15_3)s, %(ca_125)s,
                               %(critical_values)s, %(abnormal_flags)s, %(lab_comments)s)
                        """,
                        test
                    )
                
                # Sample Medical Alerts
                alerts = [
                    {
                        'id': 'alert_001_enh',
                        'patient_id': 'patient_001_enhanced',
                        'alert_type': 'Critical_Lab',
                        'severity': 'High',
                        'title': 'Low White Blood Cell Count',
                        'message': 'WBC count is 3.8 K/μL (below normal range). Patient may be at increased infection risk.',
                        'triggered_by': '{"test_id": "cbc_001_enh", "parameter": "wbc", "value": 3.8}',
                        'alert_data': '{"threshold": 4.0, "risk_level": "Moderate", "recommendations": ["Monitor for signs of infection", "Consider prophylactic measures"]}',
                        'notification_methods': '["whatsapp", "email"]',
                        'notification_sent': True
                    }
                ]
                
                for alert in alerts:
                    cur.execute(
                        """
                        INSERT IGNORE INTO medical_alerts 
                        (id, patient_id, alert_type, severity, title, message, 
                         triggered_by, alert_data, notification_methods, notification_sent)
                        VALUES (%(id)s, %(patient_id)s, %(alert_type)s, %(severity)s,
                               %(title)s, %(message)s, %(triggered_by)s, %(alert_data)s,
                               %(notification_methods)s, %(notification_sent)s)
                        """,
                        alert
                    )
                
                self.conn.commit()
                logger.info("Enhanced sample data created successfully")
                return True
                
        except Exception as e:
            logger.error(f"Error creating enhanced sample data: {e}")
            self.conn.rollback()
            return False

# Singleton instance
enhanced_schema = EnhancedMedicalSchema()
