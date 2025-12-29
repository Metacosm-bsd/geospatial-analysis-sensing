"""
Webhook signature verification utilities
"""

import hashlib
import hmac
import time
from typing import Optional


def verify_webhook_signature(
    payload: str,
    signature: str,
    secret: str,
    tolerance: int = 300,
) -> bool:
    """
    Verify webhook signature.

    Args:
        payload: Raw request body as string
        signature: Value of X-Webhook-Signature header
        secret: Your webhook signing secret
        tolerance: Maximum age of webhook in seconds (default: 300 = 5 minutes)

    Returns:
        True if signature is valid, False otherwise

    Example:
        ```python
        from flask import Flask, request
        from lidarforest import verify_webhook_signature

        @app.route('/webhook', methods=['POST'])
        def handle_webhook():
            signature = request.headers.get('X-Webhook-Signature', '')
            is_valid = verify_webhook_signature(
                payload=request.data.decode('utf-8'),
                signature=signature,
                secret=os.environ['WEBHOOK_SECRET'],
            )

            if not is_valid:
                return 'Invalid signature', 401

            event = request.json
            # Handle event...

            return 'OK', 200
        ```
    """
    try:
        # Parse signature header
        # Format: sha256=<signature>
        if not signature.startswith("sha256="):
            return False

        expected_sig = signature[7:]  # Remove "sha256=" prefix

        # Get timestamp from header if available (format: t=<timestamp>,sha256=<sig>)
        # For simpler implementation, we'll just verify the signature
        timestamp_str: Optional[str] = None
        parts = signature.split(",")
        for part in parts:
            if part.startswith("t="):
                timestamp_str = part[2:]
            elif part.startswith("sha256="):
                expected_sig = part[7:]

        # Check timestamp if present
        if timestamp_str:
            try:
                timestamp = int(timestamp_str)
                now = int(time.time())
                if abs(now - timestamp) > tolerance:
                    return False
            except ValueError:
                pass

        # Compute expected signature
        computed_sig = hmac.new(
            secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        # Compare signatures using constant-time comparison
        return hmac.compare_digest(computed_sig, expected_sig)

    except Exception:
        return False


def construct_webhook_event(
    payload: str,
    signature: str,
    secret: str,
    tolerance: int = 300,
) -> dict:
    """
    Verify and construct webhook event from payload.

    Args:
        payload: Raw request body as string
        signature: Value of X-Webhook-Signature header
        secret: Your webhook signing secret
        tolerance: Maximum age of webhook in seconds (default: 300)

    Returns:
        Parsed webhook event dict

    Raises:
        ValueError: If signature verification fails

    Example:
        ```python
        import json
        from lidarforest import construct_webhook_event

        @app.route('/webhook', methods=['POST'])
        def handle_webhook():
            try:
                event = construct_webhook_event(
                    payload=request.data.decode('utf-8'),
                    signature=request.headers.get('X-Webhook-Signature', ''),
                    secret=os.environ['WEBHOOK_SECRET'],
                )
            except ValueError as e:
                return str(e), 401

            # Handle event
            if event['event'] == 'analysis.completed':
                analysis_id = event['data']['analysisId']
                # Process completed analysis...

            return 'OK', 200
        ```
    """
    import json

    if not verify_webhook_signature(payload, signature, secret, tolerance):
        raise ValueError("Invalid webhook signature")

    return json.loads(payload)
