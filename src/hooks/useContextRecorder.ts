import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

interface UseContextRecorderProps {
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  sessionId: string;
  userId: string | undefined | null;
  getToken: any;
}

export const useContextRecorder = ({ isActive, videoRef, sessionId, userId, getToken }: UseContextRecorderProps) => {
  const lastFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isUploadingRef = useRef(false);

  // Helper: Calculate pixel difference between frames
  const calculateDiff = (oldData: Uint8ClampedArray, newData: Uint8ClampedArray) => {
    let diffPixels = 0;
    const totalPixels = oldData.length / 4;
    for (let i = 0; i < oldData.length; i += 64) {
      const rDiff = Math.abs(oldData[i] - newData[i]);
      const gDiff = Math.abs(oldData[i + 1] - newData[i + 1]);
      const bDiff = Math.abs(oldData[i + 2] - newData[i + 2]);
      if (rDiff + gDiff + bDiff > 100) diffPixels++;
    }
    return diffPixels / (totalPixels / 16);
  };

  useEffect(() => {

    // ✅ ADD THIS SPY LOG:
    console.log("[Recorder Check]", { 
        active: isActive, 
        video: !!videoRef.current, 
        session: sessionId, 
        user: userId 
    });

    // 1. Basic Checks
    if (!isActive || !videoRef.current || !sessionId || !userId) {
      if (intervalRef.current) {
        // Only log if we were previously running
        console.log("[Recorder] Stopping: Missing requirements (User/Session/Video) or Inactive.");
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    console.log(`[Recorder] 🟢 STARTING. Session: ${sessionId}, User: ${userId}`);

    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = 128;
    diffCanvas.height = 72;
    const diffCtx = diffCanvas.getContext('2d', { willReadFrequently: true });
    
    const uploadCanvas = document.createElement('canvas');

    // 2. Start the Loop
    intervalRef.current = window.setInterval(async () => {
      if (isUploadingRef.current) return;
      
      // Video Safety Check
      if (!videoRef.current || videoRef.current.readyState < 2) {
         return; 
      }

      try {
        // A. Draw small frame for diffing
        diffCtx?.drawImage(videoRef.current, 0, 0, 128, 72);
        const frameData = diffCtx?.getImageData(0, 0, 128, 72).data;
        if (!frameData) return;

        let shouldUpload = false;
        let diff = 0;
        
        // B. Calculate Visual Change
        if (lastFrameDataRef.current) {
          diff = calculateDiff(lastFrameDataRef.current, frameData);
          if (diff > 0.10) { // 10% Threshold
            console.log(`[Recorder] 📸 Change Detected: ${(diff * 100).toFixed(1)}%`);
            shouldUpload = true;
          }
        } else {
          console.log(`[Recorder] 📸 First Frame Captured.`);
          shouldUpload = true;
          diff = 1.0;
        }
        
        // C. Upload Logic
        if (shouldUpload) {
          isUploadingRef.current = true;

          // --- AUTHENTICATION ---
          console.log("[Recorder] 🔐 Requesting 'supabase' token...");
          
          let token;
          try {
             // 1. Ask ONLY for the specific template
             token = await getToken({ template: 'supabase' });
          } catch (err) {
             console.error("[Recorder] ❌ Token Fetch Error:", err);
          }

          // 2. Strict Check: If we didn't get the specific token, ABORT.
          if (!token) {
             console.error("[Recorder] 🛑 STOP: Could not get 'supabase' JWT. Check Clerk Dashboard -> JWT Templates. Name must be exactly 'supabase'.");
             isUploadingRef.current = false;
             return; 
          }
          
          // Debug: Peek at the token payload to verify it worked
          const decodeJwtPayload = (jwt: string) => {
            const part = jwt.split(".")[1];
            const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
            const json = decodeURIComponent(
              atob(base64)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
            );
            return JSON.parse(json);
          };
          
          const payload = decodeJwtPayload(token);

          console.log("[Recorder] 🎫 Token Claims:", {
            sub: payload.sub,
            clerk_user_id: payload.clerk_user_id,
            aud: payload.aud,
            role: payload.role,
          });
          
          const clerkIdFromToken = payload.clerk_user_id ?? payload.sub;
          
          // Safety: the token must correspond to the same logged-in user
          if (!clerkIdFromToken || clerkIdFromToken !== userId) {
            console.error(
              `[Recorder] 🛑 STOP: Token user mismatch. token=${clerkIdFromToken} expected=${userId}`
            );
            isUploadingRef.current = false;
            return;
          }
          
          // Hard stop if Clerk template was not actually applied  
          if (!payload.clerk_user_id) {
            console.error(
              "[Recorder] 🛑 STOP: Missing clerk_user_id claim. Fix Clerk JWT template 'supabase' to include clerk_user_id."
            );
            isUploadingRef.current = false;
            return;
          } 

          // Create an Authenticated Client for this specific request
          // Add auth config to avoid "Multiple GoTrueClient instances" warning
          const authSupabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            },
            global: { headers: { Authorization: `Bearer ${token}` } }
          });

          // --- CAPTURE & UPLOAD ---
          uploadCanvas.width = videoRef.current.videoWidth;
          uploadCanvas.height = videoRef.current.videoHeight;
          const uCtx = uploadCanvas.getContext('2d');
          uCtx?.drawImage(videoRef.current, 0, 0);

          const blob = await new Promise<Blob | null>(resolve =>
            uploadCanvas.toBlob(resolve, 'image/jpeg', 0.6)
          );
          
          if (blob) {
            const timestamp = Date.now();
            // ✅ Secure Path: userId/sessionId/timestamp.jpg
            const fileName = `${userId}/${sessionId}/${timestamp}.jpg`;
            
            console.log(`[Recorder] 🚀 Uploading to: ${fileName}`);

            const { data, error } = await authSupabase.storage
              .from('session_evidence')
              .upload(fileName, blob, { upsert: false });
              
            if (error) {
              console.error('[Recorder] ❌ UPLOAD FAILED:', error.message);
              // Common Error Tip
              if (error.message.includes('row-level security')) {
                console.error("   ↳ TIP: Check Supabase Policy. Does the path start with the User ID?");
              }
            } else if (data) {
              console.log('[Recorder] ✅ Upload Success!');
              
              // --- DATABASE LOG ---
              const auditPayload = {
                session_id: sessionId,
                user_id: userId as string,
                image_path: data.path,
                diff_percentage: diff,
                created_at: new Date().toISOString()
              };

              console.log("[Recorder] 🧾 Audit payload", auditPayload);

              const { data: auditRow, error: auditErr } = await authSupabase
                .from('audit_logs')
                .insert(auditPayload)
                .select('id')
                .single();

              if (auditErr) {
                console.error('[Recorder] ❌ Audit insert failed:', auditErr);
                // Don't crash the interval, just log and continue
              } else if (auditRow?.id) {
                console.log(`[Recorder] 📝 Audit row created: ${auditRow.id}`);
                
                // --- TRIGGER AI ANALYSIS ---
                console.log('[Recorder] 🧠 Calling analyze-screenshot...');
                try {
                  const response = await fetch(`${supabaseUrl}/functions/v1/analyze-screenshot`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                      record_id: auditRow.id,
                      image_path: data.path
                    })
                  });

                  if (!response.ok) {
                    const errorText = await response.text();
                    console.error('[Recorder] 🧠 Screenshot analysis failed:', response.status, errorText);
                  } else {
                    console.log('[Recorder] 🧠 Screenshot analyzed');
                  }
                } catch (err) {
                  console.error('[Recorder] 🧠 Screenshot analysis error:', err);
                }
              }
            }
          }
          lastFrameDataRef.current = frameData;
        }
      } catch (e) {
        console.error("[Recorder] CRITICAL ERROR:", e);
      } finally {
        isUploadingRef.current = false;
      }
    }, 3000); // Check every 3 seconds

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, sessionId, userId, videoRef, getToken]);
};