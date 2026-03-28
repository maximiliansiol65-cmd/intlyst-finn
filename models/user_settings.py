class UserSettings:
    """
    Speichert und verwaltet Nutzerpräferenzen für Automatisierungs-Level und Autonomie.
    """
    def __init__(self, user_id: int, level: int = 1, autonomy: bool = False):
        self.user_id = user_id
        self.level = level
        self.autonomy = autonomy
        self.preferences = {}

    def get_automation_level(self) -> int:
        return self.level

    def set_automation_level(self, level: int):
        self.level = level

    def set_preference(self, key: str, value):
        self.preferences[key] = value

    def get_preference(self, key: str, default=None):
        return self.preferences.get(key, default)

    def enable_autonomy(self):
        self.autonomy = True

    def disable_autonomy(self):
        self.autonomy = False

    def is_autonomous(self) -> bool:
        return self.autonomy
