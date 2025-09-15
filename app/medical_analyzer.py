"""
Medical Report Analyzer for OncoAssist
Specialized analyzers for different types of medical reports (CBC, PET/CT, Biopsy)
"""

import re
import math
from typing import Dict, Any, Optional, List, Tuple
import logging

logger = logging.getLogger(__name__)

class CBCAnalyzer:
    """Analyzer for Complete Blood Count (CBC) reports"""
    
    def __init__(self):
        # Alert thresholds (can be configured via environment)
        self.wbc_alert_cutoff = 4000  # /µL
        self.anc_alert_cutoff = 1000  # /µL
        self.hemoglobin_low = 10.0    # g/dL
        self.platelet_low = 150000    # /µL
    
    def _extract_number_before_label(self, text: str, label_regex: str) -> Optional[float]:
        """Extract number that appears before a label (e.g., '3650TLC')"""
        pattern = rf"([0-9]+(?:\.[0-9]+)?)\s*{label_regex}"
        match = re.search(pattern, text, flags=re.I)
        try:
            return float(match.group(1)) if match else None
        except (ValueError, AttributeError):
            return None
    
    def _extract_number_after_label(self, text: str, label_regex: str) -> Optional[float]:
        """Extract number that appears after a label (e.g., 'TLC: 3650')"""
        pattern = rf"{label_regex}\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)"
        match = re.search(pattern, text, flags=re.I)
        try:
            return float(match.group(1)) if match else None
        except (ValueError, AttributeError):
            return None
    
    def parse_cbc_report(self, text: str) -> Dict[str, Any]:
        """
        Parse CBC report and extract key values
        
        Args:
            text: Normalized report text
            
        Returns:
            Dictionary with CBC values and alerts
        """
        # Extract WBC/TLC
        wbc = (
            self._extract_number_before_label(text, r"TLC\b") or
            self._extract_number_after_label(text, r"TLC\b") or
            self._extract_number_after_label(text, r"\bWBC\b")
        )
        
        # Extract Hemoglobin
        hemoglobin = (
            self._extract_number_before_label(text, r"HAEMOGLOBIN\b") or
            self._extract_number_after_label(text, r"HAEMOGLOBIN\b") or
            self._extract_number_after_label(text, r"Hemoglobin\b")
        )
        
        # Extract Platelets
        platelets = (
            self._extract_number_before_label(text, r"PLATELET\s+COUNT(?:\s*\(OPTICAL\))?\b") or
            self._extract_number_after_label(text, r"PLATELET\s+COUNT(?:\s*\(OPTICAL\))?\b") or
            self._extract_number_after_label(text, r"\bPLATELETS?\b")
        )
        
        # Extract Neutrophil percentage
        neutrophils_percent = (
            self._extract_number_before_label(text, r"Neutrophils\b") or
            self._extract_number_after_label(text, r"Neutrophils\b")
        )
        
        # Calculate ANC (Absolute Neutrophil Count)
        anc = None
        if wbc is not None and neutrophils_percent is not None:
            anc = round(wbc * (neutrophils_percent / 100.0))
        
        # Generate alerts/flags
        flags = []
        if wbc is not None and wbc < self.wbc_alert_cutoff:
            flags.append(f"WBC low ({wbc}/µL, normal ≥{self.wbc_alert_cutoff})")
        
        if anc is not None and anc < self.anc_alert_cutoff:
            flags.append(f"ANC low ({anc}/µL, normal ≥{self.anc_alert_cutoff})")
        
        if hemoglobin is not None and hemoglobin < self.hemoglobin_low:
            flags.append(f"Hemoglobin low ({hemoglobin} g/dL, normal ≥{self.hemoglobin_low})")
        
        if platelets is not None and platelets < self.platelet_low:
            flags.append(f"Platelets low ({platelets}/µL, normal ≥{self.platelet_low})")
        
        return {
            "wbc": wbc,
            "hemoglobin": hemoglobin,
            "platelets": platelets,
            "neutrophils_percent": neutrophils_percent,
            "anc": anc,
            "flags": flags,
            "alert_level": "high" if any("low" in flag for flag in flags) else "normal"
        }
    
    def generate_patient_summary(self, cbc_data: Dict[str, Any]) -> str:
        """Generate patient-friendly summary of CBC results"""
        wbc = cbc_data.get("wbc", "—")
        neutrophils = cbc_data.get("neutrophils_percent", "—")
        anc = cbc_data.get("anc", "—")
        hemoglobin = cbc_data.get("hemoglobin", "—")
        platelets = cbc_data.get("platelets", "—")
        
        summary = (
            f"Your blood test shows WBC {wbc}/µL, "
            f"neutrophils {neutrophils}%, "
            f"ANC {anc}/µL, "
            f"hemoglobin {hemoglobin} g/dL, "
            f"and platelets {platelets}/µL."
        )
        
        if cbc_data.get("flags"):
            summary += " Some values are outside normal ranges and may need attention."
        
        return summary


class PETCTAnalyzer:
    """Analyzer for PET/CT scan reports"""
    
    def extract_primary_lesion(self, text: str) -> Dict[str, Any]:
        """Extract primary lesion information"""
        # Pattern for size and SUVmax
        pattern = r"(?:Right breast|Left breast).*?size\s*~?\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm.*?SUVmax[:\s]*(\d+(?:\.\d+)?)"
        match = re.search(pattern, text, flags=re.I | re.S)
        
        if match:
            return {
                "size_cm": [float(match.group(1)), float(match.group(2))],
                "suvmax": float(match.group(3))
            }
        return {}
    
    def extract_lymph_nodes(self, text: str) -> Dict[str, Any]:
        """Extract lymph node information"""
        results = {}
        
        # Axillary lymph nodes
        axillary_pattern = r"axillary lymph nodes.*?~?\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm.*?SUVmax[:\s]*(\d+(?:\.\d+)?)"
        axillary_match = re.search(axillary_pattern, text, flags=re.I | re.S)
        if axillary_match:
            results["axillary"] = {
                "size_cm": [float(axillary_match.group(1)), float(axillary_match.group(2))],
                "suvmax": float(axillary_match.group(3))
            }
        
        # Internal mammary nodes
        imn_pattern = r"internal mammary lymph node.*?SUVmax[:\s]*(\d+(?:\.\d+)?)"
        imn_match = re.search(imn_pattern, text, flags=re.I | re.S)
        if imn_match:
            results["internal_mammary"] = {
                "suvmax": float(imn_match.group(1))
            }
        
        return results
    
    def extract_metastasis_info(self, text: str) -> Dict[str, Any]:
        """Extract information about distant metastasis"""
        # Look for key phrases indicating no distant disease
        no_distant_patterns = [
            r"No other abnormal hypermetabolic lesion",
            r"No focal abnormal FDG uptake.*lung parenchyma",
            r"No evidence of distant metastasis"
        ]
        
        has_distant_disease = not any(
            re.search(pattern, text, re.I) for pattern in no_distant_patterns
        )
        
        return {
            "distant_metastasis_suspected": has_distant_disease,
            "lungs_clear": not has_distant_disease
        }
    
    def determine_tnm_staging(self, findings: Dict[str, Any]) -> Dict[str, Any]:
        """Determine radiologic TNM staging based on findings"""
        # T staging based on primary lesion size
        t_stage = None
        if "primary_lesion" in findings and "size_cm" in findings["primary_lesion"]:
            max_size = max(findings["primary_lesion"]["size_cm"])
            if max_size <= 2.0:
                t_stage = "cT1"
            elif max_size <= 5.0:
                t_stage = "cT2"
            else:
                t_stage = "cT3"
        
        # N staging based on lymph nodes
        n_stage = "cN0"
        if "lymph_nodes" in findings and "axillary" in findings["lymph_nodes"]:
            axillary_suvmax = findings["lymph_nodes"]["axillary"].get("suvmax", 0)
            if axillary_suvmax >= 2.5:  # Suspicious threshold
                n_stage = "cN1"
        
        # M staging
        m_stage = "cM0"
        if findings.get("metastasis", {}).get("distant_metastasis_suspected"):
            m_stage = "cM1"
        
        # Stage grouping (simplified AJCC 8th edition)
        stage_group = self._determine_stage_group(t_stage, n_stage, m_stage)
        
        return {
            "T": t_stage,
            "N": n_stage,
            "M": m_stage,
            "stage_group": stage_group
        }
    
    def _determine_stage_group(self, t: str, n: str, m: str) -> str:
        """Determine overall stage group from TNM"""
        if m == "cM1":
            return "Stage IV"
        if t == "cT1" and n == "cN0" and m == "cM0":
            return "Stage I"
        if ((t in {"cT0", "cT1"} and n == "cN1") or (t == "cT2" and n == "cN0")) and m == "cM0":
            return "Stage IIA"
        if ((t == "cT2" and n == "cN1") or (t == "cT3" and n == "cN0")) and m == "cM0":
            return "Stage IIB"
        if t == "cT4" or n in {"cN2", "cN3"}:
            return "Stage III"
        return "Indeterminate"
    
    def parse_petct_report(self, text: str) -> Dict[str, Any]:
        """
        Parse PET/CT report and extract key findings
        
        Args:
            text: Normalized report text
            
        Returns:
            Dictionary with PET/CT findings and staging
        """
        findings = {}
        
        # Extract primary lesion
        primary_lesion = self.extract_primary_lesion(text)
        if primary_lesion:
            findings["primary_lesion"] = primary_lesion
        
        # Extract lymph node information
        lymph_nodes = self.extract_lymph_nodes(text)
        if lymph_nodes:
            findings["lymph_nodes"] = lymph_nodes
        
        # Extract metastasis information
        metastasis = self.extract_metastasis_info(text)
        findings["metastasis"] = metastasis
        
        # Determine TNM staging
        tnm = self.determine_tnm_staging(findings)
        findings["tnm_staging"] = tnm
        
        return findings
    
    def generate_summaries(self, findings: Dict[str, Any]) -> Tuple[str, str]:
        """Generate doctor and patient summaries"""
        # Doctor summary
        primary = findings.get("primary_lesion", {})
        lymph_nodes = findings.get("lymph_nodes", {})
        tnm = findings.get("tnm_staging", {})
        
        size_text = "size not determined"
        if "size_cm" in primary:
            size_text = f"{max(primary['size_cm']):.1f} cm"
        
        doctor_summary = f"FDG-avid breast lesion ({size_text})"
        if "suvmax" in primary:
            doctor_summary += f", SUVmax {primary['suvmax']}"
        
        if "axillary" in lymph_nodes:
            ax = lymph_nodes["axillary"]
            doctor_summary += f". Axillary node {ax['size_cm'][0]}×{ax['size_cm'][1]} cm, SUVmax {ax['suvmax']}"
        
        doctor_summary += f". Radiologic TNM: {tnm.get('T', '?')} {tnm.get('N', '?')} {tnm.get('M', '?')}"
        doctor_summary += f". {tnm.get('stage_group', 'Stage indeterminate')}."
        
        # Patient summary
        patient_summary = f"Your scan shows a cancer area in the breast"
        if "size_cm" in primary:
            patient_summary += f" measuring about {max(primary['size_cm']):.1f} cm"
        
        if "axillary" in lymph_nodes:
            patient_summary += ". A nearby lymph node also shows activity, suggesting cancer may have spread there"
        
        if findings.get("metastasis", {}).get("lungs_clear"):
            patient_summary += ". The lungs appear clear"
        
        patient_summary += ". These findings help guide your treatment plan."
        
        return doctor_summary, patient_summary


class BiopsyAnalyzer:
    """Analyzer for biopsy/histopathology reports"""
    
    def extract_histology(self, text: str) -> Dict[str, str]:
        """Extract histological type and grade"""
        # Histology type patterns
        histology_patterns = [
            r"invasive (?:ductal|lobular) carcinoma(?:[^.,;]*)",
            r"carcinoma\s+no\s+special\s+type",
            r"ductal carcinoma in situ",
            r"dcis",
            r"infiltrating ductal carcinoma",
            r"idc",
            r"ilc"
        ]
        
        histology = ""
        for pattern in histology_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                histology = match.group(0)
                break
        
        # Grade extraction
        grade_patterns = [
            r"(?:nottingham|bloom[- ]?richardson|sbr)[^\.]{0,50}?\bgrade\s*([1-3])",
            r"\bgrade\s*([1-3])\b"
        ]
        
        grade = ""
        for pattern in grade_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                grade = match.group(1)
                break
        
        return {
            "histology": histology,
            "grade": grade
        }
    
    def extract_hormone_receptors(self, text: str) -> Dict[str, Dict[str, str]]:
        """Extract ER/PR receptor status"""
        def extract_receptor_info(marker: str):
            # Status (positive/negative)
            status_pattern = rf"\b{marker}\b[^.;:]*?\b(positive|negative)\b"
            status_match = re.search(status_pattern, text, re.I)
            status = status_match.group(1).capitalize() if status_match else ""
            
            # Percentage
            percent_pattern = rf"\b{marker}\b[^%]{{0,60}}?(\d{{1,3}})\s*%"
            percent_match = re.search(percent_pattern, text, re.I)
            percent = percent_match.group(1) if percent_match else ""
            
            # Allred score
            allred_pattern = rf"\b{marker}\b[^.;:]*?\ballred\s*score\s*([0-9]{{1,2}})"
            allred_match = re.search(allred_pattern, text, re.I)
            allred = allred_match.group(1) if allred_match else ""
            
            return {
                "status": status,
                "percent": percent,
                "allred_score": allred
            }
        
        return {
            "er": extract_receptor_info("er"),
            "pr": extract_receptor_info("pr")
        }
    
    def extract_her2_status(self, text: str) -> Dict[str, str]:
        """Extract HER2 status (IHC and FISH)"""
        # HER2 IHC
        ihc_pattern = r"her2(?:/neu)?[^.;:]*?\b(0|1\+|2\+|3\+|positive|negative|equivocal)\b"
        ihc_match = re.search(ihc_pattern, text, re.I)
        ihc_result = ihc_match.group(1).upper() if ihc_match and "+" in ihc_match.group(1) else (
            ihc_match.group(1).capitalize() if ihc_match else ""
        )
        
        # HER2 FISH
        fish_status_pattern = r"(?:fish|ish)[^.;:]*?\b(amplified|not amplified|positive|negative)\b"
        fish_status_match = re.search(fish_status_pattern, text, re.I)
        fish_status = fish_status_match.group(1).capitalize() if fish_status_match else ""
        
        fish_ratio_pattern = r"(?:fish|ish)[^.;:]*?\bratio\s*[:=]?\s*([0-9.]+)"
        fish_ratio_match = re.search(fish_ratio_pattern, text, re.I)
        fish_ratio = fish_ratio_match.group(1) if fish_ratio_match else ""
        
        return {
            "ihc_result": ihc_result,
            "fish_status": fish_status,
            "fish_ratio": fish_ratio
        }
    
    def extract_ki67(self, text: str) -> str:
        """Extract Ki-67 proliferation index"""
        ki67_pattern = r"\bki[- ]?67\b[^%]{0,30}?(\d{1,3})\s*%"
        match = re.search(ki67_pattern, text, re.I)
        return match.group(1) if match else ""
    
    def extract_invasion_markers(self, text: str) -> Dict[str, str]:
        """Extract lymphovascular and perineural invasion"""
        lvi_pattern = r"lymphovascular\s*invasion[^.;:]*?\b(present|absent|not identified)\b"
        lvi_match = re.search(lvi_pattern, text, re.I)
        lvi = lvi_match.group(1).capitalize() if lvi_match else ""
        
        pni_pattern = r"perineural\s*invasion[^.;:]*?\b(present|absent|not identified)\b"
        pni_match = re.search(pni_pattern, text, re.I)
        pni = pni_match.group(1).capitalize() if pni_match else ""
        
        return {
            "lymphovascular_invasion": lvi,
            "perineural_invasion": pni
        }
    
    def parse_biopsy_report(self, text: str) -> Dict[str, Any]:
        """
        Parse biopsy report and extract key pathological features
        
        Args:
            text: Normalized report text
            
        Returns:
            Dictionary with biopsy findings
        """
        # Flatten whitespace for better parsing
        text = " ".join(text.split())
        
        findings = {}
        
        # Extract histology and grade
        histology_data = self.extract_histology(text)
        findings.update(histology_data)
        
        # Extract hormone receptors
        hormone_receptors = self.extract_hormone_receptors(text)
        findings.update(hormone_receptors)
        
        # Extract HER2 status
        her2_data = self.extract_her2_status(text)
        findings["her2"] = her2_data
        
        # Extract Ki-67
        findings["ki67_percent"] = self.extract_ki67(text)
        
        # Extract invasion markers
        invasion_data = self.extract_invasion_markers(text)
        findings.update(invasion_data)
        
        return findings
    
    def generate_summaries(self, findings: Dict[str, Any]) -> Tuple[str, str]:
        """Generate doctor and patient summaries"""
        # Doctor summary
        parts = []
        
        if findings.get("histology"):
            parts.append(findings["histology"])
        
        if findings.get("grade"):
            parts.append(f"Nottingham grade {findings['grade']}")
        
        # Hormone receptors
        er_data = findings.get("er", {})
        pr_data = findings.get("pr", {})
        if er_data.get("status") or pr_data.get("status"):
            receptor_parts = []
            if er_data.get("status"):
                er_text = f"ER {er_data['status']}"
                if er_data.get("percent"):
                    er_text += f" ({er_data['percent']}%)"
                receptor_parts.append(er_text)
            
            if pr_data.get("status"):
                pr_text = f"PR {pr_data['status']}"
                if pr_data.get("percent"):
                    pr_text += f" ({pr_data['percent']}%)"
                receptor_parts.append(pr_text)
            
            parts.append("; ".join(receptor_parts))
        
        # HER2
        her2_data = findings.get("her2", {})
        if her2_data.get("ihc_result"):
            her2_text = f"HER2 IHC {her2_data['ihc_result']}"
            if her2_data.get("fish_status"):
                her2_text += f", FISH {her2_data['fish_status']}"
            parts.append(her2_text)
        
        # Ki-67
        if findings.get("ki67_percent"):
            parts.append(f"Ki-67 {findings['ki67_percent']}%")
        
        doctor_summary = "; ".join(parts) if parts else "Biopsy details extracted"
        
        # Patient summary
        patient_summary = "Your biopsy confirms the type of cancer and important markers that guide treatment. "
        
        receptor_status = []
        if er_data.get("status"):
            receptor_status.append(f"ER {er_data['status'].lower()}")
        if pr_data.get("status"):
            receptor_status.append(f"PR {pr_data['status'].lower()}")
        if her2_data.get("ihc_result"):
            receptor_status.append(f"HER2 {her2_data['ihc_result']}")
        
        if receptor_status:
            patient_summary += f"The report shows {', '.join(receptor_status)}. "
        
        if findings.get("ki67_percent"):
            patient_summary += f"Ki-67 is about {findings['ki67_percent']}%. "
        
        patient_summary += "These results help your doctors choose the most effective treatments for you."
        
        return doctor_summary, patient_summary


class MedicalAnalyzerService:
    """Main service that coordinates all medical report analyzers"""
    
    def __init__(self):
        self.cbc_analyzer = CBCAnalyzer()
        self.petct_analyzer = PETCTAnalyzer()
        self.biopsy_analyzer = BiopsyAnalyzer()
    
    def analyze_report(self, report_type: str, text: str) -> Dict[str, Any]:
        """
        Analyze medical report based on its type
        
        Args:
            report_type: Type of report ('cbc', 'pet_ct', 'biopsy')
            text: Normalized report text
            
        Returns:
            Dictionary with analysis results
        """
        if report_type == "cbc":
            analysis = self.cbc_analyzer.parse_cbc_report(text)
            analysis["patient_summary"] = self.cbc_analyzer.generate_patient_summary(analysis)
            return analysis
        
        elif report_type == "pet_ct":
            analysis = self.petct_analyzer.parse_petct_report(text)
            doctor_summary, patient_summary = self.petct_analyzer.generate_summaries(analysis)
            analysis["doctor_summary"] = doctor_summary
            analysis["patient_summary"] = patient_summary
            return analysis
        
        elif report_type == "biopsy":
            analysis = self.biopsy_analyzer.parse_biopsy_report(text)
            doctor_summary, patient_summary = self.biopsy_analyzer.generate_summaries(analysis)
            analysis["doctor_summary"] = doctor_summary
            analysis["patient_summary"] = patient_summary
            return analysis
        
        else:
            return {
                "error": f"Unknown report type: {report_type}",
                "patient_summary": "Report processed but specific analysis not available for this type."
            }
