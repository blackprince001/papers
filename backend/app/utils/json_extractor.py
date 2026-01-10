"""Utility functions for extracting JSON from AI responses."""
import json
import re
from typing import Any, Optional


def extract_json_from_text(text: str) -> Any:
    """
    Extract and parse JSON from text that may contain markdown code blocks or extra text.
    
    This function handles cases where:
    - JSON is wrapped in markdown code blocks (```json ... ```)
    - There's explanatory text before or after the JSON
    - The response contains only JSON
    
    Args:
        text: The text containing JSON to extract
        
    Returns:
        The parsed JSON object (dict or list)
        
    Raises:
        json.JSONDecodeError: If no valid JSON can be extracted or parsed
        ValueError: If the text is empty or contains no JSON-like content
    """
    if not text:
        raise ValueError("Text is empty")
    
    # Strip leading/trailing whitespace
    text = text.strip()
    
    if not text:
        raise ValueError("Text contains only whitespace")
    
    # Remove markdown code blocks if present
    # Handle ```json ... ``` or ``` ... ```
    if text.startswith("```"):
        # Find the first newline after ```
        first_newline = text.find("\n")
        if first_newline != -1:
            # Remove the opening ``` and language specifier (e.g., ```json)
            text = text[first_newline + 1:]
        else:
            # No newline, just remove the ```
            text = text[3:]
        
        # Remove closing ```
        if text.endswith("```"):
            text = text[:-3]
        
        text = text.strip()
    
    # Also handle cases where there's a language specifier on its own line
    # e.g., "json\n{...}" or "json\n[...]"
    if text.startswith("json\n"):
        text = text[5:]
    elif text.startswith("json\r\n"):
        text = text[6:]
    
    text = text.strip()
    
    # Find JSON boundaries by looking for first { or [
    json_start = -1
    json_char = None
    
    for i, char in enumerate(text):
        if char == '{':
            json_start = i
            json_char = '{'
            break
        elif char == '[':
            json_start = i
            json_char = '['
            break
    
    if json_start == -1:
        # No JSON-like structure found, try parsing the whole text
        # This handles cases where the text is already clean JSON
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"No JSON structure found in text. First 200 chars: {text[:200]}"
            ) from e
    
    # Find the matching closing bracket
    bracket_count = 0
    json_end = -1
    closing_char = '}' if json_char == '{' else ']'
    
    for i in range(json_start, len(text)):
        char = text[i]
        if char == json_char:
            bracket_count += 1
        elif char == closing_char:
            bracket_count -= 1
            if bracket_count == 0:
                json_end = i + 1
                break
    
    if json_end == -1:
        # Couldn't find matching closing bracket
        # Try parsing from json_start to end anyway
        json_end = len(text)
    
    # Extract the JSON substring
    json_text = text[json_start:json_end].strip()
    
    if not json_text:
        raise ValueError("Extracted JSON text is empty")
    
    # Parse the JSON
    try:
        return json.loads(json_text)
    except json.JSONDecodeError as e:
        # Provide more context in the error
        raise json.JSONDecodeError(
            f"Failed to parse extracted JSON. Text preview: {json_text[:200]}",
            json_text,
            e.pos
        ) from e

