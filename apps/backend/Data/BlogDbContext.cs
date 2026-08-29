using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Data;

public sealed class BlogDbContext(DbContextOptions<BlogDbContext> options)
    : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<SiteInstallation> SiteInstallations => Set<SiteInstallation>();
    public DbSet<Post> Posts => Set<Post>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<SiteInstallation>(entity =>
        {
            entity.HasKey(installation => installation.Id);
            entity.Property(installation => installation.Id).ValueGeneratedNever();
            entity.HasOne<ApplicationUser>()
                .WithMany()
                .HasForeignKey(installation => installation.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasData(new SiteInstallation
            {
                Id = SiteInstallation.SingletonId,
                IsInitialized = false,
                IsInitializationInProgress = false,
            });
        });

        builder.Entity<Post>(entity =>
        {
            entity.HasKey(post => post.Id);
            entity.HasIndex(post => post.PostNumber).IsUnique();
            entity.Property(post => post.Title).HasMaxLength(240);
            entity.Property(post => post.Description).HasMaxLength(500);
            entity.Property(post => post.Status).HasMaxLength(16);
            entity.HasOne(post => post.Owner)
                .WithMany()
                .HasForeignKey(post => post.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
