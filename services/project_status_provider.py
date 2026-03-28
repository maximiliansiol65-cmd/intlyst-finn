class ProjectStatusProvider:
    """
    Liefert Statusinformationen zu offenen/abgeschlossenen Tasks, Deadlines etc.
    """
    def __init__(self, db_session, workspace_id: int):
        self.db = db_session
        self.workspace_id = workspace_id

    def get_status(self):
        from models.task import Task
        open_tasks = self.db.query(Task).filter(Task.workspace_id == self.workspace_id, Task.status == "open").count()
        overdue_tasks = self.db.query(Task).filter(Task.workspace_id == self.workspace_id, Task.status == "open", Task.due_date != None, Task.due_date < func.current_date()).count()
        return {
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
        }
