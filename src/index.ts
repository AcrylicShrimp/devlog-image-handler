import { S3Handler } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { encode } from 'blurhash';
import sharp from 'sharp';
import { Readable } from 'stream';

export const handler: S3Handler = async (event) => {
  await Promise.all(
    event.Records.map(async (record) => {
      try {
        const s3 = new S3Client({
          region: record.awsRegion,
        });
        const result = await s3.send(
          new GetObjectCommand({
            Bucket: record.s3.bucket.name,
            Key: record.s3.object.key,
          }),
        );
        const body = await new Promise<Buffer>((resolve, reject) => {
          try {
            if (!result.Body) throw new Error();

            const chunks: Uint8Array[] = [];

            (result.Body as Readable).on('error', reject);
            (result.Body as Readable).on('data', (chunk) => chunks.push(chunk));
            (result.Body as Readable).on('end', () => resolve(Buffer.concat(chunks)));
          } catch (err) {
            reject(err);
          }
        });
        const image = sharp(body);
        const { width, height } = await image.metadata();
        let hash: string | null = null;

        if (width && height) {
          const maxDim = Math.max(width, height);
          const minComponentCount = Math.round(Math.min(width, height) / Math.floor(maxDim / 5));

          if (minComponentCount) {
            let resizedWidth: number;
            let resizedHeight: number;

            if (maxDim === width) {
              resizedWidth = 100;
              resizedHeight = Math.round((100 / width) * height);
            } else {
              resizedWidth = Math.round((100 / height) * width);
              resizedHeight = 100;
            }

            const componentX = maxDim === width ? 5 : minComponentCount;
            const componentY = maxDim === width ? minComponentCount : 5;

            hash = encode(
              Uint8ClampedArray.from(
                await image
                  .resize(maxDim === width ? { width: 100 } : { height: 100 })
                  .ensureAlpha()
                  .toFormat('raw')
                  .toBuffer(),
              ),
              resizedWidth,
              resizedHeight,
              componentX,
              componentY,
            );
          }
        }

        console.log({
          width,
          height,
          hash,
        });

        return {
          width,
          height,
          hash,
        };
      } catch {
        return;
      }
    }),
  );
};
