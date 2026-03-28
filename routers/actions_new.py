"""
routers/actions.py (Enhanced)

API endpoints for Schicht 12: Action Generation Engine.
Exposes recommended actions with ICE-scores to frontend.

Endpoints:
  GET /api/actions/ Top actions by ICE scorerecommended 
  POST /api/actions/{id}/ Mark action as implementedimplement 
  GET /api/actions/ ML learning metricsaccuracy 
  POST /api/actions/{id}/ User feedback on actionfeedback 

Integration:
  - Calls analytics.action_engine.generate_action_plan()
  - Uses analytics.memory for accuracy tracking
  - Returns JSON formatted for frontend
"""

from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta
import logging

from analytics.action_engine import (
    generate_action_plan,
    build_action_context,
    ActionCategory,
)
from analytics.proactive_engine import detect_proactive_alerts

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/actions", tags=["actions"])


# ============================================================================
# MOCK DATA FOR DEMO
# ============================================================================

def _get_mock_bundles():
    """Get all mock analytics bundles."""
    today = datetime.now().date()
    
    proactive_alerts = detect_proactive_alerts(
        stats_bundle={
            "daily_revenue": 1340.0,
            "revenue_7d_avg": 1200.0,
            "revenue_z_score": 0.5,
            "conversion_rate": 0.032,
            "conversion_rate_avg": 0.032,
            "data_quality": 95,
        },
        internal_data={"payment_failures_1h": 0},
        goals=[
            {
                "id": "goal_1",
                "title": "Monthly Revenue",
                "progress": 18500.0,
                "target": 30000.0,
                "deadline": (today + timedelta(days=7)).isoformat(),
            }
        ],
    ).alerts
    
    social_bundle = {
        "instagram_reels_multiplier": 4.2,
        "best_posting_hour": 19,
        "best_posting_day": "Friday",
        "monthly_follower_growth_rate": 0.08,
        "social_reach_to_revenue_correlation_p": 0.02,
    }
    
    forecast_bundle = {
        "month_end_projection": 25000,
        "monthly_goal": 30000,
        "trend": "neutral",
    }
    
    causality_bundle = {
        "proven_relationships": [
            {
                "cause": "instagram_reach",
                "effect": "revenue",
                "p_value": 0.025,
                "lag_days": 2,
                "effect_size": 0.15,
            }
        ]
    }
    
    stats_bundle = {
        "revenue_momentum_7d": 0.08,
        "revenue_best_weekday": "Friday",
        "revenue_7d_avg": 1200,
    }
    
    return {
        "proactive_alerts": proactive_alerts,
        "social_bundle": social_bundle,
        "forecast_bundle": forecast_bundle,
        "causality_bundle": causality_bundle,
        "stats_bundle": stats_bundle,
    }


# ============================================================================
# API ENDPOINTS
# ============================================================================


@router.get("/recommended")
async def get_recommended_actions(
    limit: int = Query(5, description="Max actions to return"),
    category: str = Query(None, description="Filter by category"),
):
    """
    Get recommended actions ranked by ICE score.
    
    Query Parameters:
    - limit: Maximum actions (default 5)
    - category: Filter (marketing, sales, product, operations, data, strategy)
    
    Returns:
    - actions: List of top actions sorted by ICE score
    - top_action: Highest priority action
    - total_impact_euros: Sum of expected impact
    - summary: Status summary
    
    Example Response:
    ```json
    {
      "actions": [
        {
          "id": "action_20260324_001",
          "title": "Shift to video content (Reels/TikToks)",
          "description": "Reels erhalten 4.2x mehr Reichweite",
          "category": "marketing",
          "impact_euros": 1840.0,
          "impact_confidence": 85,
          "ease_hours": 2.0,
          "ice_score": 67,
          "priority": "high",
          "timeframe": "this_week",
          "action_steps": [
            "1. Plan 5 Reel ideas for next week",
            "2. Create in batch on Sunday"
          ],
          "expected_metrics": ["instagram_reach", "instagram_followers"]
        }
      ],
      "top_action": {...},
      "total_impact_euros": 3200.0,
    }      "summary": "
    ```
    """
    try:
        logger.info(f"GET /recommended (limit={limit}, category={category})")
        
        # Get mock bundles
        bundles = _get_mock_bundles()
        
        # Generate action plan
        plan = generate_action_plan(
            proactive_alerts=bundles["proactive_alerts"],
            social_bundle=bundles["social_bundle"],
            forecast_bundle=bundles["forecast_bundle"],
            causality_bundle=bundles["causality_bundle"],
            stats_bundle=bundles["stats_bundle"],
        )
        
        # Filter by category if specified
        if category:
            plan.actions = [a for a in plan.actions if a.category.value == category]
        
        # Limit results
        plan.actions = plan.actions[:limit]
        
        return plan.to_dict()
    
    except Exception as e:
        logger.error(f"Error in GET /recommended: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/actions/{action_id}/implement")
async def mark_action_implemented(action_id: str):
    """
    Mark an action as implemented by user.
    
    Path Parameters:
    - action_id: The action ID
    
    Returns:
    - status: "implemented"
    - action_id: The action ID
    - implemented_at: Timestamp
    - measurement_start: When to start measuring impact
    - measurement_end: When to measure results
    
    Note: After 7 days, impact will be measured and accuracy tracked
    """
    try:
        logger.info(f"POST /actions/{action_id}/implement")
        
        now = datetime.utcnow()
        measurement_end = now + timedelta(days=7)
        
        return {
            "status": "implemented",
            "action_id": action_id,
            "implemented_at": now.isoformat(),
            "measurement_start": now.isoformat(),
            "measurement_end": measurement_end.isoformat(),
            "message": "Great! Impact will be measured in 7 days for learning"
        }
    
    except Exception as e:
        logger.error(f"Error in POST /implement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/accuracy")
async def get_action_accuracy():
    """
    Get action recommendation accuracy metrics (ML learning).
    
    Shows how accurate our recommendations have been for this user.
    
    Returns:
 accuracy stats
    - overall_accuracy: 0-100 overall accuracy
    - most_reliable: Best performing category
    - least_reliable: Category needing improvement
    - recommendations: Number of recommendations tracked
    
    Example Response:
    ```json
    {
      "overall_accuracy": 72.0,
      "by_category": {
        "marketing": {
          "accuracy_rate": 0.75,
          "total_recommendations": 8,
          "implemented_count": 6,
          "implementation_rate": 0.75,
          "avg_impact_error_pct": -5.2
        },
        "sales": {
          "accuracy_rate": 0.60,
          "total_recommendations": 5,
          "implemented_count": 3,
          "implementation_rate": 0.60,
          "avg_impact_error_pct": 12.8
        }
      },
      "most_reliable": "marketing",
      "least_reliable": "sales",
      "message": "Marketing recommendations have been most accurate"
    }
    ```
    """
    try:
        logger.info("GET /accuracy")
        
        # In production: query from analytics.memory
        # For demo: return mock learning metrics
        
        return {
            "overall_accuracy": 72.0,
            "by_category": {
                "marketing": {
                    "accuracy_rate": 0.75,
                    "total_recommendations": 8,
                    "implemented_count": 6,
                    "implementation_rate": 0.75,
                    "avg_impact_error_pct": -5.2,
                },
                "sales": {
                    "accuracy_rate": 0.60,
                    "total_recommendations": 5,
                    "implemented_count": 3,
                    "implementation_rate": 0.60,
                    "avg_impact_error_pct": 12.8,
                },
                "product": {
                    "accuracy_rate": 0.80,
                    "total_recommendations": 5,
                    "implemented_count": 4,
                    "implementation_rate": 0.80,
                    "avg_impact_error_pct": -2.1,
                },
            },
            "most_reliable": "product",
            "least_reliable": "sales",
            "message": "Product recommendations have been most accurate (80%)",
            "last_updated": datetime.utcnow().isoformat(),
        }
    
    except Exception as e:
        logger.error(f"Error in GET /accuracy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/actions/{action_id}/feedback")
async def submit_action_feedback(
    action_id: str,
    helpful: bool = Query(..., description="Was action helpful?"),
    reason: str = Query(None, description="Why or why not?"),
):
    """
    Submit user feedback on action accuracy.
    
    Used for ML calibration to improve future recommendations.
    
    Path Parameters:
    - action_id: The action ID
    
    Query Parameters:
    - helpful: true if action was helpful, false if not
    - reason: Optional explanation
    
    Returns:
    - status: "feedback_recorded"
    - action_id: The action ID
    - feedback_summary: Recorded feedback
    
    Note: This feedback improves future recommendations through ML calibration
    """
    try:
        logger.info(f"POST /actions/{action_id}/feedback (helpful={helpful})")
        
        # In production: save to analytics.memory for ML
        # Update AccuracyMetrics and calibration
        
        return {
            "status": "feedback_recorded",
            "action_id": action_id,
            "helpful": helpful,
            "reason": reason or "No reason provided",
            "message": "Danke fuer dein Feedback! Hilft uns besser zu werden.",
            "recorded_at": datetime.utcnow().isoformat(),
        }
    
    except Exception as e:
        logger.error(f"Error in POST /feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
