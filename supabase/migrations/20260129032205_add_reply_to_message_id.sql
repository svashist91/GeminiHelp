ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS reply_to_message_id text;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to
ON public.messages (reply_to_message_id);

ALTER TABLE public.messages
ADD CONSTRAINT messages_reply_to_not_self
CHECK (reply_to_message_id IS NULL OR reply_to_message_id <> id);
