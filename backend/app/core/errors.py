class ServiceError(Exception):
    def __init__(self, message: str, status_code: int = 503, code: str = "service_unavailable"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
