from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any


SUPPORTED_NODE_TYPES = {"agent", "skill", "policy", "approval", "router", "memory", "provider"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_node(node: dict[str, Any]) -> dict[str, Any]:
    position = node.get("position") or {}
    data = node.get("data") or {}
    return {
        "id": normalize_text(node.get("id")),
        "type": normalize_text(node.get("type")),
        "position": {
            "x": float(position.get("x", 0.0) or 0.0),
            "y": float(position.get("y", 0.0) or 0.0),
        },
        "data": dict(data),
    }


def normalize_edge(edge: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": normalize_text(edge.get("id")),
        "source": normalize_text(edge.get("source")),
        "target": normalize_text(edge.get("target")),
        "type": normalize_text(edge.get("type")) or "delegation",
        "data": dict(edge.get("data") or {}),
    }


def edge_key(edge: dict[str, Any]) -> tuple[str, str, str]:
    return edge["source"], edge["target"], edge["type"]


def build_graph_index(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]):
    incident_counts = defaultdict(int)
    incoming = defaultdict(list)
    outgoing = defaultdict(list)
    for edge in edges:
        incident_counts[edge["source"]] += 1
        incident_counts[edge["target"]] += 1
        incoming[edge["target"]].append(edge)
        outgoing[edge["source"]].append(edge)
    return incident_counts, incoming, outgoing


def detect_cycles(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[list[str]]:
    node_ids = {node["id"] for node in nodes}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if edge["source"] in node_ids and edge["target"] in node_ids:
            adjacency[edge["source"]].append(edge["target"])

    cycles: list[list[str]] = []
    visited: set[str] = set()
    stack: list[str] = []
    active: set[str] = set()

    def visit(node_id: str):
        visited.add(node_id)
        active.add(node_id)
        stack.append(node_id)
        for next_id in adjacency.get(node_id, []):
            if next_id not in visited:
                visit(next_id)
            elif next_id in active:
                cycle_start = stack.index(next_id)
                cycles.append(stack[cycle_start:] + [next_id])
        stack.pop()
        active.remove(node_id)

    for node_id in node_ids:
        if node_id not in visited:
            visit(node_id)
    return cycles


def choose_node_by_keywords(nodes: list[dict[str, Any]], *, node_type: str, keywords: list[str]) -> dict[str, Any] | None:
    candidates = [node for node in nodes if node["type"] == node_type]
    for keyword in keywords:
        for node in candidates:
            label = normalize_text(node["data"].get("label")).lower()
            role = normalize_text(node["data"].get("role")).lower()
            if keyword in label or keyword in role:
                return node
    return candidates[0] if candidates else None


def compile_workflow(payload: dict[str, Any], *, organization_id: str, operator_id: str | None = None) -> dict[str, Any]:
    workflow = dict(payload.get("workflow") or {})
    nodes = [normalize_node(node) for node in payload.get("nodes", [])]
    edges = [normalize_edge(edge) for edge in payload.get("edges", [])]
    issues: list[dict[str, Any]] = []

    node_ids = {node["id"] for node in nodes}
    edge_ids = {edge["id"] for edge in edges}

    if not nodes:
        issues.append({"level": "error", "code": "empty_graph", "message": "Add at least one node before deployment."})

    for node in nodes:
        if node["type"] not in SUPPORTED_NODE_TYPES:
            issues.append({"level": "error", "code": "unsupported_node_type", "node_id": node["id"], "message": f"Unsupported node type: {node['type']}."})
        if not node["id"]:
            issues.append({"level": "error", "code": "missing_node_id", "message": "Every node requires an id."})

    for edge in edges:
        if not edge["id"]:
            issues.append({"level": "error", "code": "missing_edge_id", "message": "Every edge requires an id."})
        if edge["source"] not in node_ids or edge["target"] not in node_ids:
            issues.append({"level": "error", "code": "dangling_edge", "edge_id": edge["id"], "message": f"Edge {edge['id']} references a missing node."})

    incident_counts, incoming, outgoing = build_graph_index(nodes, edges)

    agent_nodes = [node for node in nodes if node["type"] == "agent"]
    skill_nodes = [node for node in nodes if node["type"] == "skill"]
    policy_nodes = [node for node in nodes if node["type"] == "policy"]
    approval_nodes = [node for node in nodes if node["type"] == "approval"]
    provider_nodes = [node for node in nodes if node["type"] == "provider"]

    for agent in agent_nodes:
        if not normalize_text(agent["data"].get("role")):
            issues.append({"level": "error", "code": "agent_role_missing", "node_id": agent["id"], "message": f"{agent['data'].get('label') or agent['id']} is missing a role binding."})
        if not normalize_text(agent["data"].get("label")):
            issues.append({"level": "error", "code": "agent_label_missing", "node_id": agent["id"], "message": f"{agent['id']} requires a visible label."})
        if incident_counts.get(agent["id"], 0) == 0:
            issues.append({"level": "error", "code": "orphaned_agent", "node_id": agent["id"], "message": f"{agent['data'].get('label') or agent['id']} is not connected to the workflow."})

    for skill in skill_nodes:
        execution_type = normalize_text(skill["data"].get("executionType"))
        if execution_type not in {"tool", "reasoning", "hybrid"}:
            issues.append({"level": "error", "code": "skill_execution_type_invalid", "node_id": skill["id"], "message": f"{skill['data'].get('label') or skill['id']} needs a valid execution type."})
        if incident_counts.get(skill["id"], 0) == 0:
            issues.append({"level": "error", "code": "orphaned_skill", "node_id": skill["id"], "message": f"{skill['data'].get('label') or skill['id']} is not connected to an agent or policy."})
        if not normalize_text(skill["data"].get("provider")) and not any(edge["source"] in {provider["id"] for provider in provider_nodes} and edge["target"] == skill["id"] for edge in edges):
            issues.append({"level": "error", "code": "provider_binding_missing", "node_id": skill["id"], "message": f"{skill['data'].get('label') or skill['id']} is missing a provider binding."})

    for policy in policy_nodes:
        if incident_counts.get(policy["id"], 0) == 0:
            issues.append({"level": "error", "code": "orphaned_policy", "node_id": policy["id"], "message": f"{policy['data'].get('label') or policy['id']} is not bound to any agent or skill."})
        if not policy["data"].get("restrictions") and not policy["data"].get("conditions"):
            issues.append({"level": "warn", "code": "policy_unconfigured", "node_id": policy["id"], "message": f"{policy['data'].get('label') or policy['id']} has no rules defined yet."})

    for approval in approval_nodes:
        if incident_counts.get(approval["id"], 0) == 0:
            issues.append({"level": "error", "code": "orphaned_approval", "node_id": approval["id"], "message": f"{approval['data'].get('label') or approval['id']} is not connected to the workflow."})
        if not incoming.get(approval["id"]):
            issues.append({"level": "error", "code": "approval_chain_missing", "node_id": approval["id"], "message": f"{approval['data'].get('label') or approval['id']} needs an incoming approval edge."})

    if len(agent_nodes) > 1:
        delegation_edges = [edge for edge in edges if edge["type"] == "delegation" and edge["source"] in {node["id"] for node in agent_nodes} and edge["target"] in {node["id"] for node in agent_nodes}]
        if not delegation_edges:
            issues.append({"level": "error", "code": "delegation_path_missing", "message": "At least one agent-to-agent delegation path is required."})

    head_admin_node = choose_node_by_keywords(agent_nodes, node_type="agent", keywords=["head admin", "head-admin", "admin"])
    finance_node = choose_node_by_keywords(agent_nodes, node_type="agent", keywords=["finance", "financial"])
    if head_admin_node and finance_node:
        if not any(edge["type"] == "delegation" and edge["source"] == head_admin_node["id"] and edge["target"] == finance_node["id"] for edge in edges):
            issues.append({"level": "error", "code": "head_admin_delegation_missing", "message": "Head Admin must delegate to Finance Agent in the runtime graph."})

    cycles = detect_cycles(nodes, edges)
    if cycles:
        issues.append({"level": "error", "code": "graph_cycle_detected", "message": f"Workflow contains a cycle: {' -> '.join(cycles[0])}"})

    if skill_nodes and not provider_nodes:
        issues.append({"level": "error", "code": "provider_node_missing", "message": "Add at least one provider node for skill routing."})

    runtime_config = {
        "organization_id": organization_id,
        "operator_id": operator_id or "system",
        "workflow_name": normalize_text(workflow.get("name")) or "Visual Workforce Graph",
        "subsystem": normalize_text(workflow.get("subsystem")) or "admin",
        "team_id": normalize_text(workflow.get("team_id")) or "",
        "head_admin_agent_id": head_admin_node["id"] if head_admin_node else (agent_nodes[0]["id"] if agent_nodes else ""),
        "head_admin_agent_name": normalize_text(head_admin_node["data"].get("label")) if head_admin_node else (normalize_text(agent_nodes[0]["data"].get("label")) if agent_nodes else ""),
        "finance_agent_id": finance_node["id"] if finance_node else (agent_nodes[1]["id"] if len(agent_nodes) > 1 else (agent_nodes[0]["id"] if agent_nodes else "")),
        "finance_agent_name": normalize_text(finance_node["data"].get("label")) if finance_node else (normalize_text(agent_nodes[1]["data"].get("label")) if len(agent_nodes) > 1 else (normalize_text(agent_nodes[0]["data"].get("label")) if agent_nodes else "")),
        "delegation_target_id": finance_node["id"] if finance_node else "",
        "delegation_target_name": normalize_text(finance_node["data"].get("label")) if finance_node else "",
        "skill_id": skill_nodes[0]["id"] if skill_nodes else "",
        "skill_name": normalize_text(skill_nodes[0]["data"].get("label")) if skill_nodes else "",
        "provider_name": normalize_text(provider_nodes[0]["data"].get("provider") or provider_nodes[0]["data"].get("label")) if provider_nodes else "mock",
        "approval_node_id": approval_nodes[0]["id"] if approval_nodes else "",
        "approval_node_name": normalize_text(approval_nodes[0]["data"].get("label")) if approval_nodes else "",
        "policy_ids": [node["id"] for node in policy_nodes],
        "provider_node_ids": [node["id"] for node in provider_nodes],
    }

    normalized_definition = {
        "workflow": {
            **workflow,
            "organizationId": organization_id,
            "compiledAt": now_iso(),
            "version": int(workflow.get("version") or 1),
            "status": workflow.get("status") or "draft",
        },
        "nodes": nodes,
        "edges": edges,
        "runtime_config": runtime_config,
    }

    return {
        "definition": normalized_definition,
        "issues": issues,
        "validation_status": "invalid" if any(issue["level"] == "error" for issue in issues) else "valid",
        "summary": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "agent_count": len(agent_nodes),
            "skill_count": len(skill_nodes),
            "policy_count": len(policy_nodes),
            "approval_count": len(approval_nodes),
            "provider_count": len(provider_nodes),
            "cycle_count": len(cycles),
        },
    }
