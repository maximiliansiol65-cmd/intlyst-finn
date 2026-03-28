"""Shared slowapi Limiter — importiert in main.py und allen Routern die Rate Limiting brauchen."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
