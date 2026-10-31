from rest_framework import serializers

from core_api.serializers import BaseSerializer
from core_api.viewsets import BaseViewSet
from tests.testapp.models import Book, Club, Shelf, Tag


class ShelfSerializer(BaseSerializer):
    class Meta:
        model = Shelf


class TagSerializer(BaseSerializer):
    class Meta:
        model = Tag


class QuoteSerializer(serializers.Serializer):
    text = serializers.CharField()
    page = serializers.IntegerField(required=False)


class BookSerializer(BaseSerializer):
    # Structured lists, described as `type: "list"` with `items`: one of
    # plain values, one of objects (a nested serializer). Both are
    # write-only here - the test app has no columns for them.
    keywords = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)
    quotes = serializers.ListField(child=QuoteSerializer(), required=False, write_only=True)

    class Meta:
        model = Book
        related_endpoints = {"shelf_ref": "/shelves"}
        extra_kwargs = {"cover": {"style": {"accept": ".png,.jpg"}}}

    def create(self, validated_data):
        validated_data.pop("keywords", None)
        validated_data.pop("quotes", None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("keywords", None)
        validated_data.pop("quotes", None)
        return super().update(instance, validated_data)


class ClubSerializer(BaseSerializer):
    class Meta:
        model = Club
        display_field = "name"


class OwnedViewSet(BaseViewSet):
    """Scoped to `?as=<owner>` (or an `X-As` header) - stands in for a real module's
    `request.user.id` scoping without needing an auth stack."""

    def get_queryset(self):
        owner = self.request.query_params.get("as") or self.request.headers.get("X-As", "")
        return super().get_queryset().filter(owner=owner).order_by("pk")


class ShelfViewSet(OwnedViewSet):
    queryset = Shelf.objects.all()
    serializer_class = ShelfSerializer
    # Only read by an access policy (tests/test_access.py) - a plain
    # field stands in for a real scope like an org id.
    scope_field = "name"


class TagViewSet(OwnedViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer


class BookViewSet(OwnedViewSet):
    queryset = Book.objects.all()
    serializer_class = BookSerializer
    search_fields = ["title"]


class ClubViewSet(OwnedViewSet):
    queryset = Club.objects.all()
    serializer_class = ClubSerializer
