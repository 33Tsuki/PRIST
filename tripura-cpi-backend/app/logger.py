import logging
import os
from logging.handlers import TimedRotatingFileHandler

from app.config import settings

_NAME_TO_LEVEL = {
    "CRITICAL": logging.CRITICAL,
    "ERROR": logging.ERROR,
    "WARNING": logging.WARNING,
    "INFO": logging.INFO,
    "DEBUG": logging.DEBUG,
}


class LevelFormatter(logging.Formatter):
    """Different formats for ERROR/CRITICAL (include file:line) vs others."""

    FORMATS = {
        logging.DEBUG: "%(asctime)s - %(name)s - DEBUG - %(message)s",
        logging.INFO: "%(asctime)s - %(name)s - INFO - %(message)s",
        logging.WARNING: "%(asctime)s - %(name)s - WARNING - %(message)s",
        logging.ERROR: "%(asctime)s - %(name)s - ERROR - %(filename)s:%(lineno)d - %(message)s",
        logging.CRITICAL: "%(asctime)s - %(name)s - CRITICAL - %(filename)s:%(lineno)d - %(message)s",
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno, self.FORMATS[logging.INFO])
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


def setup_logging() -> logging.Logger:
    os.makedirs(settings.log_dir, exist_ok=True)

    file_level = _NAME_TO_LEVEL.get(settings.log_file_level.upper(), logging.DEBUG)
    console_level = _NAME_TO_LEVEL.get(settings.log_console_level.upper(), logging.INFO)

    app_logger = logging.getLogger("tripura_cpi")
    app_logger.setLevel(min(file_level, console_level))

    if app_logger.hasHandlers():
        app_logger.handlers.clear()

    formatter = LevelFormatter()

    file_handler = TimedRotatingFileHandler(
        filename=os.path.join(settings.log_dir, "app.log"),
        when="midnight",
        interval=1,
        backupCount=7,
        encoding="utf-8",
    )
    file_handler.setLevel(file_level)
    file_handler.setFormatter(formatter)
    app_logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(console_level)
    console_handler.setFormatter(formatter)
    app_logger.addHandler(console_handler)

    app_logger.propagate = False

    return app_logger


logger = setup_logging()
