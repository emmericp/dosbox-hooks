#pragma once

#include "mailbox.h"

#define LOG(fmt, ...) mailbox_sendf(MAILBOX_TYPE_INFO, fmt,  ##__VA_ARGS__)
#define LOG_DEBUG(fmt, ...) mailbox_sendf(MAILBOX_TYPE_DEBUG, fmt,  ##__VA_ARGS__)
#define LOG_INFO(fmt, ...) mailbox_sendf(MAILBOX_TYPE_INFO, fmt,  ##__VA_ARGS__)
#define LOG_WARN(fmt, ...) mailbox_sendf(MAILBOX_TYPE_WARN, fmt,  ##__VA_ARGS__)
#define LOG_ERROR(fmt, ...) mailbox_sendf(MAILBOX_TYPE_ERROR, fmt,  ##__VA_ARGS__)

#define LOG_HEX(ptr, len) mailbox_send(MAILBOX_TYPE_RAW_HEX, ptr, len)