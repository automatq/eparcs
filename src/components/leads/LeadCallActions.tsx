"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, Loader2, PhoneCall, Voicemail } from "lucide-react";

const CALL_TYPES = [
  { value: "cold_intro", label: "Cold Introduction" },
  { value: "follow_up_no_reply", label: "Follow Up (No Reply)" },
  { value: "follow_up_opened", label: "Follow Up (Opened Email)" },
  { value: "follow_up_interested", label: "Follow Up (Interested)" },
  { value: "voicemail_drop", label: "Voicemail Drop" },
];

export function LeadCallActions({
  leadId,
  phoneNumber,
}: {
  leadId: string;
  phoneNumber: string | null;
}) {
  const router = useRouter();
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);
  const [callType, setCallType] = useState("cold_intro");
  const [customPhone, setCustomPhone] = useState(phoneNumber ?? "");

  async function handleCall() {
    if (!customPhone) return;
    setCalling(true);
    setCallResult(null);
    try {
      const res = await fetch("/api/calls/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          callType,
          phoneNumber: customPhone,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCallResult(data);
        router.refresh();
      } else {
        setCallResult({ error: data.error });
      }
    } catch {
      setCallResult({ error: "Failed to initiate call" });
    } finally {
      setCalling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <PhoneCall className="h-4 w-4" />
          AI Voice Call
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Phone number"
            value={customPhone}
            onChange={(e) => setCustomPhone(e.target.value)}
            className="flex-1"
          />
          <Select
            value={callType}
            onValueChange={(v) => { if (v) setCallType(v); }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleCall}
          disabled={calling || !customPhone}
          className="w-full"
        >
          {calling ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Initiating Call...
            </>
          ) : callType === "voicemail_drop" ? (
            <>
              <Voicemail className="mr-2 h-4 w-4" />
              Drop Voicemail
            </>
          ) : (
            <>
              <Phone className="mr-2 h-4 w-4" />
              Start AI Call
            </>
          )}
        </Button>

        {callResult && !callResult.error && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500/10 text-green-500">Call Initiated</Badge>
              <span className="text-xs text-muted-foreground">ID: {callResult.callId}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Greeting:</span> {callResult.script?.greeting}
            </p>
            <p className="text-xs text-muted-foreground">
              The AI agent is calling now. Results will appear here once the call completes.
            </p>
          </div>
        )}

        {callResult?.error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-xs text-red-500">{callResult.error}</p>
          </div>
        )}

        {!process.env.NEXT_PUBLIC_BLAND_CONFIGURED && (
          <p className="text-xs text-muted-foreground">
            Requires BLAND_API_KEY in .env. Get one at bland.ai
          </p>
        )}
      </CardContent>
    </Card>
  );
}
