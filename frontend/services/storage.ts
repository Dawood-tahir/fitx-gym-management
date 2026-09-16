import { createClient } from "@/lib/supabase/client";
import { ApiError, throwIfError } from "./errors";

export type FitxImageBucket = "member-photos" | "staff-photos" | "gym-assets";

const acceptedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const maxImageBytes = 5 * 1024 * 1024;

export async function uploadImage(bucket: FitxImageBucket, file: File, folder: string) {
  const extension = acceptedImageTypes.get(file.type);
  if (!extension) throw new ApiError("Choose a JPG, PNG, or WebP image.", 400);
  if (file.size > maxImageBytes) throw new ApiError("Images must be 5 MB or smaller.", 400);

  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  throwIfError(userError, "Your session could not be verified.");
  if (!userData.user) throw new ApiError("Sign in before uploading an image.", 401);

  const path = `${userData.user.id}/${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  throwIfError(error, "The image could not be uploaded.");
  return path;
}

export async function removeImage(bucket: FitxImageBucket, path?: string | null) {
  if (!path) return;
  const { error } = await createClient().storage.from(bucket).remove([path]);
  throwIfError(error, "The old image could not be removed.");
}

export async function signedImageUrl(bucket: FitxImageBucket, path?: string | null) {
  if (!path) return undefined;
  const { data, error } = await createClient().storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return undefined;
  return data.signedUrl;
}
