#This file contains init logic for src cloudops OTel traces.
from .tracer import TraceInstrumentation, tracer

__all__ = ["TraceInstrumentation", "tracer"]
