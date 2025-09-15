"""
PDF Parsing Service for OncoAssist
Handles extraction and processing of medical reports from PDF files
"""

import re
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
import logging

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

logger = logging.getLogger(__name__)

class PDFParsingService:
    """Service for parsing medical PDFs and extracting structured data"""
    
    def __init__(self):
        if fitz is None:
            logger.warning("PyMuPDF not installed. PDF parsing will be limited.")
    
    def extract_text_from_pdf(self, pdf_path: Path) -> str:
        """
        Extract text content from PDF file
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Extracted text content
        """
        if fitz is None:
            raise RuntimeError("PyMuPDF not installed. Install with: pip install PyMuPDF")
        
        try:
            doc = fitz.open(str(pdf_path))
            text = "".join([page.get_text() for page in doc])
            doc.close()
            return text
        except Exception as e:
            logger.error(f"Error extracting text from {pdf_path}: {e}")
            return ""
    
    def normalize_text(self, text: str) -> str:
        """
        Normalize extracted text for better parsing
        
        Args:
            text: Raw text content
            
        Returns:
            Normalized text
        """
        # Remove carriage returns
        text = text.replace("\r", "")
        
        # Normalize spaces and tabs
        text = re.sub(r"[ \t]+", " ", text)
        
        # Normalize line breaks
        text = re.sub(r"\n{2,}", "\n\n", text)
        
        # Remove common PDF artifacts
        text = re.sub(r"Page No: .*?\n", "", text)
        text = re.sub(r"Report Released on *:.*?\n", "", text)
        
        return text.strip()
    
    def extract_patient_info(self, text: str) -> Dict[str, str]:
        """
        Extract patient information from report text
        
        Args:
            text: Report text content
            
        Returns:
            Dictionary with patient information
        """
        def _first_group(pattern: str, flags=0) -> str:
            """Helper to extract first regex group safely"""
            match = re.search(pattern, text, flags)
            return match.group(1).strip() if match else ""
        
        return {
            "name": _first_group(r"Patient Name\s*:\s*(.+)"),
            "id": _first_group(r"Patient ID\s*([\w-]+)"),
            "sex_age": _first_group(r"Sex\s*/\s*Age\s*:\s*(.+)"),
            "contact": _first_group(r"(?:Phone|Mobile|Contact)\s*:\s*([\+\d\s\-\(\)]+)"),
            "aadhar": _first_group(r"Aadhar(?:/ Passport)? No\s*:\s*([\w ]+)")
        }
    
    def extract_report_metadata(self, text: str) -> Dict[str, str]:
        """
        Extract report metadata (date, doctor, etc.)
        
        Args:
            text: Report text content
            
        Returns:
            Dictionary with report metadata
        """
        def _first_group(pattern: str, flags=0) -> str:
            match = re.search(pattern, text, flags)
            return match.group(1).strip() if match else ""
        
        return {
            "report_date": _first_group(r"Report Date\s*:\s*(.+)"),
            "collection_date": _first_group(r"Collection Date\s*:\s*(.+)"),
            "doctor": _first_group(r"Referred by\s*:\s*(.+)"),
            "hospital": _first_group(r"Hospital\s*:\s*(.+)"),
            "lab": _first_group(r"Laboratory\s*:\s*(.+)")
        }
    
    def detect_report_type(self, text: str) -> str:
        """
        Detect the type of medical report
        
        Args:
            text: Report text content
            
        Returns:
            Report type ('cbc', 'pet_ct', 'biopsy', 'unknown')
        """
        text_lower = text.lower()
        
        # PET/CT scan patterns
        pet_patterns = [
            r"\bpet/?ct\b",
            r"\bfdg\b",
            r"\bsuv\s*max\b",
            r"\bsuvmax\b",
            r"\bwhole[- ]?body\b",
            r"positron emission tomography"
        ]
        
        # Biopsy/Histopathology patterns
        biopsy_patterns = [
            r"\bhistopatholog(y|ical)\b",
            r"\bbiopsy\b",
            r"\bimmunohistochemistry\b",
            r"\bihc\b",
            r"\ber\b.*\bpr\b",
            r"\bher2\b",
            r"\bki[- ]?67\b",
            r"\bnottingham\b",
            r"\bbloom[- ]?richardson\b"
        ]
        
        # CBC/Blood test patterns
        cbc_patterns = [
            r"\bcomplete\s+blood\s+count\b",
            r"\bc\.?b\.?c\.?\b",
            r"\bhaematology\s+test\s+report\b",
            r"\bwbc\b",
            r"\btlc\b",
            r"\bhemoglobin\b",
            r"\bplatelet\s+count\b"
        ]
        
        # Check for each type
        if any(re.search(pattern, text_lower) for pattern in pet_patterns):
            return "pet_ct"
        elif any(re.search(pattern, text_lower) for pattern in biopsy_patterns):
            return "biopsy"
        elif any(re.search(pattern, text_lower) for pattern in cbc_patterns):
            return "cbc"
        else:
            return "unknown"
    
    def parse_pdf_to_structured_data(
        self, 
        pdf_path: Path, 
        output_dir: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Parse PDF and extract structured medical data
        
        Args:
            pdf_path: Path to the PDF file
            output_dir: Directory to save processed files
            
        Returns:
            Dictionary with structured medical data
        """
        if output_dir is None:
            output_dir = Path("./data/outputs")
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Extract and normalize text
        raw_text = self.extract_text_from_pdf(pdf_path)
        if not raw_text:
            raise ValueError(f"Could not extract text from {pdf_path}")
        
        normalized_text = self.normalize_text(raw_text)
        
        # Save text file
        text_file = output_dir / f"{pdf_path.stem}.txt"
        text_file.write_text(normalized_text, encoding="utf-8")
        
        # Extract basic information
        patient_info = self.extract_patient_info(raw_text)
        report_metadata = self.extract_report_metadata(raw_text)
        report_type = self.detect_report_type(normalized_text)
        
        # Build structured data
        structured_data = {
            "source_file": str(pdf_path.resolve()),
            "report_type": report_type,
            "patient": patient_info,
            "metadata": report_metadata,
            "text_content": normalized_text,
            "artifacts": {
                "text_file": str(text_file),
                "processed_at": str(pdf_path.stat().st_mtime)
            }
        }
        
        # Save structured data
        json_file = output_dir / f"{pdf_path.stem}.structured.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(structured_data, f, ensure_ascii=False, indent=2)
        
        structured_data["artifacts"]["json_file"] = str(json_file)
        
        logger.info(f"Parsed {pdf_path.name} as {report_type} report")
        return structured_data
    
    def batch_process_pdfs(
        self, 
        pdf_paths: List[Path], 
        output_dir: Optional[Path] = None
    ) -> List[Dict[str, Any]]:
        """
        Process multiple PDF files in batch
        
        Args:
            pdf_paths: List of PDF file paths
            output_dir: Directory to save processed files
            
        Returns:
            List of structured data for each PDF
        """
        results = []
        
        for pdf_path in pdf_paths:
            try:
                result = self.parse_pdf_to_structured_data(pdf_path, output_dir)
                results.append(result)
            except Exception as e:
                logger.error(f"Error processing {pdf_path}: {e}")
                # Add error result
                results.append({
                    "source_file": str(pdf_path.resolve()),
                    "report_type": "error",
                    "error": str(e),
                    "patient": {},
                    "metadata": {}
                })
        
        return results
    
    def extract_sections_from_text(self, text: str) -> Dict[str, str]:
        """
        Extract common medical report sections
        
        Args:
            text: Normalized report text
            
        Returns:
            Dictionary with extracted sections
        """
        sections = {}
        
        # Common section patterns
        section_patterns = [
            ("clinical_history", r"Clinical History\s*:\s*"),
            ("procedure", r"Procedure\s*:\s*"),
            ("observations", r"Observations\s*:\s*"),
            ("findings", r"Findings\s*:\s*"),
            ("opinion", r"(?:OPINION|Impression)\s*:\s*"),
            ("conclusion", r"Conclusion\s*:\s*"),
            ("recommendations", r"Recommendations?\s*:\s*")
        ]
        
        # Find section positions
        positions = {}
        for section_name, pattern in section_patterns:
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                positions[section_name] = match.start()
        
        # Extract section content
        sorted_positions = sorted(positions.items(), key=lambda x: x[1])
        
        for i, (section_name, start_pos) in enumerate(sorted_positions):
            # Find the pattern again to get the end of the header
            pattern = next(p for name, p in section_patterns if name == section_name)
            match = re.search(pattern, text, flags=re.IGNORECASE)
            content_start = match.end()
            
            # Find the end position (start of next section or end of text)
            if i + 1 < len(sorted_positions):
                content_end = sorted_positions[i + 1][1]
            else:
                content_end = len(text)
            
            # Extract and clean content
            content = text[content_start:content_end].strip()
            sections[section_name] = content
        
        return sections

# Helper function for compatibility
def extract_text_pdf(path: Path) -> str:
    """Legacy function for compatibility"""
    parser = PDFParsingService()
    return parser.extract_text_from_pdf(path)

def normalize_text(text: str) -> str:
    """Legacy function for compatibility"""
    parser = PDFParsingService()
    return parser.normalize_text(text)
