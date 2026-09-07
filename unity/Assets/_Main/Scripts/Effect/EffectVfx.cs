using UnityEngine;

namespace ProjectX.Effect
{
    /// <summary>
    /// The whole particle vocabulary, driven by one pooled ParticleSystem.
    ///
    /// Every effect is the same emitter with different EmitParams, so the game
    /// carries a single draw call and a single fixed particle budget instead of
    /// a system per effect.
    /// </summary>
    public sealed class EffectVfx : MonoBehaviour
    {
        const int MaxParticles = 120;

        static readonly Color RimSpark = new Color(1f, 0.85f, 0.55f, 1f);
        static readonly Color SwishSpark = new Color(1f, 0.72f, 0.22f, 1f);
        static readonly Color CelebrateSpark = new Color(1f, 0.45f, 0.30f, 1f);

        ParticleSystem _particles;

        public void Init(int sortingLayerId, int sortingOrder)
        {
            // Deliberately unparented. The effect root carries the Canvas, whose
            // RectTransform Unity drives to screen-pixel coordinates — emitting
            // world-space particles under it would be a trap for anyone who
            // later enables the shape module or switches to local simulation.
            var go = new GameObject("EffectParticles");

            _particles = go.AddComponent<ParticleSystem>();

            ParticleSystem.MainModule main = _particles.main;
            // Loops forever at a zero emission rate. A stopped system does not
            // simulate, so particles pushed in via Emit would freeze on screen;
            // keeping it playing costs nothing while no particles are alive.
            main.loop = true;
            // Auto-play so the emitter starts regardless of activation order.
            // Harmless: the emission rate is zero until something calls Emit.
            main.playOnAwake = true;
            main.maxParticles = MaxParticles;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startLifetime = 0.5f;
            main.startSpeed = 0f;
            main.startSize = 0.1f;
            main.gravityModifier = 0.6f;
            // Unscaled so bursts stay crisp during the 0.3x buzzer window.
            main.useUnscaledTime = true;

            ParticleSystem.EmissionModule emission = _particles.emission;
            emission.enabled = true;
            emission.rateOverTime = 0f;

            ParticleSystem.ShapeModule shape = _particles.shape;
            shape.enabled = false;

            ParticleSystem.ColorOverLifetimeModule fade = _particles.colorOverLifetime;
            fade.enabled = true;
            var gradient = new Gradient();
            gradient.SetKeys(
                new[]
                {
                    new GradientColorKey(Color.white, 0f),
                    new GradientColorKey(Color.white, 1f),
                },
                new[]
                {
                    new GradientAlphaKey(1f, 0f),
                    new GradientAlphaKey(1f, 0.55f),
                    new GradientAlphaKey(0f, 1f),
                });
            fade.color = new ParticleSystem.MinMaxGradient(gradient);

            var psRenderer = go.GetComponent<ParticleSystemRenderer>();
            if (psRenderer != null)
            {
                Shader shader = Shader.Find("Sprites/Default");
                if (shader != null)
                {
                    psRenderer.material = new Material(shader);
                }
                psRenderer.sortingLayerID = sortingLayerId;
                psRenderer.sortingOrder = sortingOrder;
            }

            _particles.Play();
        }

        /// <summary>The emitter is unparented, so it must be cleaned up by hand.</summary>
        void OnDestroy()
        {
            if (_particles != null)
            {
                Destroy(_particles.gameObject);
            }
        }

        /// <summary>Tiny tick when the ball clips the rim.</summary>
        public void RimImpact(Vector3 worldPos)
        {
            Emit(worldPos, 5, RimSpark, 1.4f, 0.07f, 0.28f);
        }

        /// <summary>Clean make — the signature effect.</summary>
        public void SwishBurst(Vector3 worldPos)
        {
            Emit(worldPos, 22, SwishSpark, 3.2f, 0.11f, 0.55f);
        }

        /// <summary>Ordinary make — present but clearly lesser than a swish.</summary>
        public void ScoreBurst(Vector3 worldPos)
        {
            Emit(worldPos, 9, RimSpark, 2.0f, 0.09f, 0.4f);
        }

        /// <summary>Milestone / buzzer-beater make.</summary>
        public void Celebrate(Vector3 worldPos)
        {
            Emit(worldPos, 40, CelebrateSpark, 4.6f, 0.13f, 0.85f);
        }

        void Emit(Vector3 worldPos, int count, Color color, float speed, float size, float lifetime)
        {
            if (_particles == null)
            {
                return;
            }

            var ep = new ParticleSystem.EmitParams();

            for (int i = 0; i < count; i++)
            {
                Vector2 dir = Random.insideUnitCircle.normalized;
                if (dir == Vector2.zero)
                {
                    dir = Vector2.up;
                }

                float magnitude = speed * Random.Range(0.45f, 1f);

                ep.position = worldPos;
                ep.velocity = new Vector3(dir.x * magnitude, Mathf.Abs(dir.y) * magnitude, 0f);
                ep.startColor = color;
                ep.startSize = size * Random.Range(0.7f, 1.3f);
                ep.startLifetime = lifetime * Random.Range(0.75f, 1.15f);

                _particles.Emit(ep, 1);
            }
        }
    }
}
